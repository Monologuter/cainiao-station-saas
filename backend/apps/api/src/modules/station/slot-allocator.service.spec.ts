import { ApiCode } from '../../core/http/api-code';
import { SlotAllocatorService } from './slot-allocator.service';

describe('SlotAllocatorService', () => {
  it('allocates the first free active slot and marks it occupied', async () => {
    const candidate = { id: 'slot1', version: 0 };
    const tx = {
      slot: {
        findMany: jest.fn().mockResolvedValue([candidate]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...candidate,
          status: 'OCCUPIED',
        }),
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const lock = {
      withLock: jest.fn((_key, _ttl, fn) => fn()),
    } as any;
    const service = new SlotAllocatorService(tenantPrisma, lock);

    await expect(
      service.allocate('station1', 'parcel1'),
    ).resolves.toMatchObject({
      id: 'slot1',
      status: 'OCCUPIED',
    });
    expect(tx.slot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stationId: 'station1',
          status: 'FREE',
          shelf: { status: 'ACTIVE', deletedAt: null },
        }),
        orderBy: [
          { rowNo: 'asc' },
          { levelNo: 'asc' },
          { colNo: 'asc' },
          { code: 'asc' },
        ],
      }),
    );
    expect(tx.slot.updateMany).toHaveBeenCalledWith({
      where: { id: 'slot1', status: 'FREE', version: 0 },
      data: {
        status: 'OCCUPIED',
        currentParcelId: 'parcel1',
        version: { increment: 1 },
      },
    });
    expect(lock.withLock).toHaveBeenCalledWith(
      'lock:slot:slot1',
      5000,
      expect.any(Function),
    );
  });

  it('retries the next candidate when optimistic update loses the race', async () => {
    const candidates = [
      { id: 'slot1', version: 0 },
      { id: 'slot2', version: 3 },
    ];
    const tx = {
      slot: {
        findMany: jest.fn().mockResolvedValue(candidates),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'slot2' }),
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const lock = { withLock: jest.fn((_key, _ttl, fn) => fn()) } as any;
    const service = new SlotAllocatorService(tenantPrisma, lock);

    await expect(
      service.allocate('station1', 'parcel1'),
    ).resolves.toMatchObject({
      id: 'slot2',
    });
    expect(tx.slot.updateMany).toHaveBeenCalledTimes(2);
  });

  it('throws NO_FREE_SLOT when there is no available slot', async () => {
    const tx = { slot: { findMany: jest.fn().mockResolvedValue([]) } };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const lock = { withLock: jest.fn() } as any;
    const service = new SlotAllocatorService(tenantPrisma, lock);

    await expect(service.allocate('station1', 'parcel1')).rejects.toMatchObject(
      {
        code: ApiCode.NO_FREE_SLOT,
      },
    );
  });

  it('release is idempotent and clears matching occupied slot', async () => {
    const tx = {
      slot: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'slot1',
          status: 'OCCUPIED',
          currentParcelId: 'parcel1',
        }),
        update: jest.fn().mockResolvedValue({ id: 'slot1', status: 'FREE' }),
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const service = new SlotAllocatorService(tenantPrisma, {} as any);

    await expect(service.release('slot1', 'parcel1')).resolves.toBeUndefined();
    expect(tx.slot.update).toHaveBeenCalledWith({
      where: { id: 'slot1' },
      data: {
        status: 'FREE',
        currentParcelId: null,
        version: { increment: 1 },
      },
    });
  });

  it('release does not clear a slot occupied by another parcel', async () => {
    const tx = {
      slot: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'slot1',
          status: 'OCCUPIED',
          currentParcelId: 'other',
        }),
        update: jest.fn(),
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const service = new SlotAllocatorService(tenantPrisma, {} as any);

    await service.release('slot1', 'parcel1');

    expect(tx.slot.update).not.toHaveBeenCalled();
  });

  it('parallel allocations claim different slots', async () => {
    const slots = [
      { id: 'slot1', version: 0, status: 'FREE', code: 'A-01' },
      { id: 'slot2', version: 0, status: 'FREE', code: 'A-02' },
      { id: 'slot3', version: 0, status: 'FREE', code: 'A-03' },
    ];
    const tx = {
      slot: {
        findMany: async () => slots.filter((slot) => slot.status === 'FREE'),
        updateMany: async ({ where, data }: any) => {
          const slot = slots.find(
            (item) =>
              item.id === where.id &&
              item.status === where.status &&
              item.version === where.version,
          );
          if (!slot) return { count: 0 };
          slot.status = data.status;
          slot.version += 1;
          return { count: 1 };
        },
        findUniqueOrThrow: async ({ where }: any) =>
          slots.find((slot) => slot.id === where.id),
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const lock = { withLock: jest.fn((_key, _ttl, fn) => fn()) } as any;
    const service = new SlotAllocatorService(tenantPrisma, lock);

    const allocated = await Promise.all([
      service.allocate('station1', 'p1'),
      service.allocate('station1', 'p2'),
      service.allocate('station1', 'p3'),
    ]);

    expect(new Set(allocated.map((slot) => slot.id)).size).toBe(3);
  });
});
