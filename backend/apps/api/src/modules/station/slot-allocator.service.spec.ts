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

  it('allocates the recommended slot before the rule-ordered first slot', async () => {
    const candidates = [
      { id: 'slot1', code: 'A-01', version: 0, rowNo: 1, levelNo: 1, colNo: 1 },
      { id: 'slot2', code: 'B-01', version: 0, rowNo: 2, levelNo: 1, colNo: 1 },
    ];
    const tx = {
      parcel: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'parcel1',
          receiverPhoneTail: '1234',
          createdAt: new Date('2026-06-18T10:00:00.000Z'),
        }),
      },
      slot: {
        findMany: jest.fn().mockResolvedValue(candidates),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...candidates[1],
          status: 'OCCUPIED',
        }),
      },
    };
    const recommender = {
      recommend: jest
        .fn()
        .mockResolvedValue([
          { slotId: 'slot2', score: 0.92, reasons: ['近门动线'] },
        ]),
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const lock = { withLock: jest.fn((_key, _ttl, fn) => fn()) } as any;
    const service = new SlotAllocatorService(
      tenantPrisma,
      lock,
      recommender as any,
    );

    await expect(
      service.allocate('station1', 'parcel1'),
    ).resolves.toMatchObject({
      id: 'slot2',
      source: 'AI',
      score: 0.92,
      reasons: ['近门动线'],
    });
    expect(tx.slot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'slot2', status: 'FREE', version: 0 },
      }),
    );
  });

  it('feeds recent slot heat into the recommender instead of zero-filled placeholders', async () => {
    const candidates = [
      { id: 'slot1', code: 'A-01', version: 0, rowNo: 1, levelNo: 1, colNo: 1 },
      { id: 'slot2', code: 'B-01', version: 0, rowNo: 2, levelNo: 1, colNo: 1 },
    ];
    const tx = {
      parcel: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'parcel1',
          receiverPhoneTail: '1234',
          createdAt: new Date('2026-06-18T10:00:00.000Z'),
        }),
      },
      slot: {
        findMany: jest.fn().mockResolvedValue(candidates),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...candidates[0],
          status: 'OCCUPIED',
        }),
      },
      slotHeatDaily: {
        findMany: jest.fn().mockResolvedValue([
          {
            slotId: 'slot1',
            pickCount: 3,
            hourHistogram: Array.from({ length: 24 }, (_, hour) =>
              hour === 9 ? 2 : 0,
            ),
          },
          {
            slotId: 'slot1',
            pickCount: 4,
            hourHistogram: Array.from({ length: 24 }, (_, hour) =>
              hour === 10 ? 5 : 0,
            ),
          },
          {
            slotId: 'slot2',
            pickCount: 1,
            hourHistogram: Array(24).fill(0),
          },
        ]),
      },
    };
    const recommender = {
      recommend: jest
        .fn()
        .mockResolvedValue([{ slotId: 'slot1', score: 0.93, reasons: [] }]),
    };
    const service = new SlotAllocatorService(
      { withTenant: async (fn: any) => fn(tx) } as any,
      { withLock: jest.fn((_key, _ttl, fn) => fn()) } as any,
      recommender as any,
    );

    await service.allocate('station1', 'parcel1');

    expect(tx.slotHeatDaily.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stationId: 'station1',
          slotId: { in: ['slot1', 'slot2'] },
        }),
      }),
    );
    expect(recommender.recommend).toHaveBeenCalledWith(
      expect.objectContaining({
        candidates: expect.arrayContaining([
          expect.objectContaining({
            slotId: 'slot1',
            heat: expect.objectContaining({
              pickCount7d: 7,
              hourHistogram: expect.arrayContaining([expect.any(Number)]),
            }),
          }),
        ]),
      }),
    );
    const slot1 = recommender.recommend.mock.calls[0][0].candidates.find(
      (candidate: any) => candidate.slotId === 'slot1',
    );
    expect(slot1.heat.hourHistogram[9]).toBe(2);
    expect(slot1.heat.hourHistogram[10]).toBe(5);
  });

  it('tries the next recommended slot when the first recommendation loses the race', async () => {
    const candidates = [
      { id: 'slot1', code: 'A-01', version: 0 },
      { id: 'slot2', code: 'A-02', version: 0 },
    ];
    const tx = {
      parcel: {
        findUnique: jest.fn().mockResolvedValue({
          receiverPhoneTail: '1234',
          createdAt: new Date('2026-06-18T10:00:00.000Z'),
        }),
      },
      slot: {
        findMany: jest.fn().mockResolvedValue(candidates),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'slot2' }),
      },
    };
    const recommender = {
      recommend: jest.fn().mockResolvedValue([
        { slotId: 'slot1', score: 0.9, reasons: [] },
        { slotId: 'slot2', score: 0.8, reasons: [] },
      ]),
    };
    const service = new SlotAllocatorService(
      { withTenant: async (fn: any) => fn(tx) } as any,
      { withLock: jest.fn((_key, _ttl, fn) => fn()) } as any,
      recommender as any,
    );

    await expect(
      service.allocate('station1', 'parcel1'),
    ).resolves.toMatchObject({
      id: 'slot2',
      source: 'AI',
      score: 0.8,
    });
    expect(tx.slot.updateMany).toHaveBeenCalledTimes(2);
  });

  it('falls back to rule allocation when the recommender is unavailable', async () => {
    const candidate = { id: 'slot1', code: 'A-01', version: 0 };
    const tx = {
      parcel: {
        findUnique: jest.fn().mockResolvedValue({
          receiverPhoneTail: '1234',
          createdAt: new Date('2026-06-18T10:00:00.000Z'),
        }),
      },
      slot: {
        findMany: jest.fn().mockResolvedValue([candidate]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'slot1' }),
      },
    };
    const recommender = { recommend: jest.fn().mockResolvedValue(null) };
    const service = new SlotAllocatorService(
      { withTenant: async (fn: any) => fn(tx) } as any,
      { withLock: jest.fn((_key, _ttl, fn) => fn()) } as any,
      recommender as any,
    );

    await expect(
      service.allocate('station1', 'parcel1'),
    ).resolves.toMatchObject({
      id: 'slot1',
      source: 'RULE_FALLBACK',
    });
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
