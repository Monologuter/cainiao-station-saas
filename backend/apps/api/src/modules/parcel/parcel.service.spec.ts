import { TenantContext } from '../../core/tenant-context/tenant-context';
import { ParcelService } from './parcel.service';

function runAsTenant<T>(fn: () => T) {
  return TenantContext.run(
    { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
    fn,
  );
}

describe('ParcelService', () => {
  it('creates PENDING parcel and INBOUND event', async () => {
    const created: any = {};
    const tx = {
      parcel: {
        create: async ({ data }: any) =>
          (created.parcel = { id: 'p1', status: 'PENDING', ...data }),
      },
      parcelEvent: {
        create: async ({ data }: any) => (created.event = data),
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const bus = { publish: jest.fn() } as any;
    const service = new ParcelService(tenantPrisma, bus);

    const out = await runAsTenant(() =>
      service.create({
        stationId: 's1',
        waybillNo: 'YT001',
        carrier: 'YTO',
        receiverPhone: '13800000000',
      }),
    );

    expect(out.id).toBe('p1');
    expect(created.parcel).toMatchObject({
      tenantId: 't1',
      stationId: 's1',
      waybillNo: 'YT001',
      receiverPhoneTail: '0000',
      status: 'PENDING',
      createdBy: 'u1',
    });
    expect(created.event).toMatchObject({
      tenantId: 't1',
      parcelId: 'p1',
      fromStatus: null,
      toStatus: 'PENDING',
      eventType: 'INBOUND',
      operatorId: 'u1',
    });
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it('marks parcel STORED, writes event and publishes ParcelStored', async () => {
    const tx = {
      parcel: {
        findUniqueOrThrow: async () => ({
          id: 'p1',
          tenantId: 't1',
          stationId: 's1',
          status: 'PENDING',
          receiverPhone: '13800000000',
          receiverPhoneTail: '0000',
        }),
        update: async ({ data }: any) => ({
          id: 'p1',
          tenantId: 't1',
          stationId: 's1',
          status: 'STORED',
          receiverPhone: '13800000000',
          receiverPhoneTail: '0000',
          pickupCode: data.pickupCode,
          slotId: data.slotId,
        }),
      },
      slot: {
        findUnique: async () => ({ id: 'slot1', code: 'A-01' }),
      },
      parcelEvent: { create: jest.fn() },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const bus = { publish: jest.fn() } as any;
    const service = new ParcelService(tenantPrisma, bus);

    const out = await runAsTenant(() =>
      service.markStored('p1', { pickupCode: '1234', slotId: 'slot1' }),
    );

    expect(out.status).toBe('STORED');
    expect(tx.parcelEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 't1',
        parcelId: 'p1',
        fromStatus: 'PENDING',
        toStatus: 'STORED',
        eventType: 'STORED',
      }),
    });
    expect(bus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ParcelStored',
        payload: expect.objectContaining({
          parcelId: 'p1',
          tenantId: 't1',
          stationId: 's1',
          receiverPhone: '13800000000',
          pickupCode: '1234',
          slotCode: 'A-01',
        }),
      }),
    );
  });

  it('marks parcel PICKED_UP with optimistic version and publishes ParcelPickedUp', async () => {
    const tx = {
      parcel: {
        findUniqueOrThrow: async () => ({
          id: 'p1',
          tenantId: 't1',
          stationId: 's1',
          status: 'STORED',
          version: 2,
          slotId: 'slot1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: async () => ({
          id: 'p1',
          tenantId: 't1',
          stationId: 's1',
          status: 'PICKED_UP',
          slotId: 'slot1',
        }),
      },
      parcelEvent: { create: jest.fn() },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const bus = { publish: jest.fn() } as any;
    const service = new ParcelService(tenantPrisma, bus);

    await runAsTenant(() => service.markPickedUp('p1', 2));

    expect(tx.parcel.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'STORED', version: 2 },
      data: {
        status: 'PICKED_UP',
        pickedUpAt: expect.any(Date),
        version: { increment: 1 },
      },
    });
    expect(bus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ParcelPickedUp',
        payload: expect.objectContaining({
          parcelId: 'p1',
          tenantId: 't1',
          stationId: 's1',
          slotId: 'slot1',
        }),
      }),
    );
  });

  it('rejects stale pickup version', async () => {
    const tx = {
      parcel: {
        findUniqueOrThrow: async () => ({
          id: 'p1',
          tenantId: 't1',
          stationId: 's1',
          status: 'STORED',
          version: 2,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const bus = { publish: jest.fn() } as any;
    const service = new ParcelService(tenantPrisma, bus);

    await expect(
      runAsTenant(() => service.markPickedUp('p1', 2)),
    ).rejects.toThrow('包裹已被取走');
  });
});
