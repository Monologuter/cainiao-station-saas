import { ApiCode } from '../../core/http/api-code';
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

  it('marks parcel STORED with optimistic version, writes event and publishes ParcelStored', async () => {
    let stored = false;
    const updateMany = jest.fn(async () => {
      stored = true;
      return { count: 1 };
    });
    const tx = {
      parcel: {
        findUniqueOrThrow: async () =>
          stored
            ? {
                id: 'p1',
                tenantId: 't1',
                stationId: 's1',
                status: 'STORED',
                version: 1,
                receiverPhone: '13800000000',
                receiverPhoneTail: '0000',
                pickupCode: '1234',
                slotId: 'slot1',
              }
            : {
                id: 'p1',
                tenantId: 't1',
                stationId: 's1',
                status: 'PENDING',
                version: 0,
                receiverPhone: '13800000000',
                receiverPhoneTail: '0000',
              },
        updateMany,
      },
      slot: {
        findUnique: async () => ({ id: 'slot1', code: 'A-01' }),
      },
      parcelEvent: { create: jest.fn() },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const bus = { publish: jest.fn() } as any;
    const service = new ParcelService(tenantPrisma, bus);
    const reservePickupCode = jest.fn().mockResolvedValue('1234');

    const out = await runAsTenant(() =>
      service.markStored('p1', { slotId: 'slot1', reservePickupCode }),
    );

    expect(out.status).toBe('STORED');
    expect(reservePickupCode).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'PENDING', version: 0 },
      data: expect.objectContaining({
        pickupCode: '1234',
        slotId: 'slot1',
        status: 'STORED',
        storedAt: expect.any(Date),
        version: { increment: 1 },
      }),
    });
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

  it('rejects markStored when version moved (optimistic lock count !== 1)', async () => {
    const tx = {
      parcel: {
        findUniqueOrThrow: async () => ({
          id: 'p1',
          tenantId: 't1',
          stationId: 's1',
          status: 'PENDING',
          version: 0,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      slot: { findUnique: jest.fn() },
      parcelEvent: { create: jest.fn() },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const bus = { publish: jest.fn() } as any;
    const service = new ParcelService(tenantPrisma, bus);
    const reservePickupCode = jest.fn().mockResolvedValue('1234');

    await expect(
      runAsTenant(() =>
        service.markStored('p1', { slotId: 'slot1', reservePickupCode }),
      ),
    ).rejects.toThrow('包裹状态已变化');
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it('retries with a fresh pickup code on P2002 conflict, no raw 500', async () => {
    let stored = false;
    const updateMany = jest
      .fn()
      // First attempt collides with ux_parcel_active_code.
      .mockImplementationOnce(async () => {
        const err: any = new Error('Unique constraint failed');
        err.code = 'P2002';
        throw err;
      })
      // Second attempt with a fresh code succeeds.
      .mockImplementationOnce(async () => {
        stored = true;
        return { count: 1 };
      });
    const tx = {
      parcel: {
        findUniqueOrThrow: async () =>
          stored
            ? {
                id: 'p1',
                tenantId: 't1',
                stationId: 's1',
                status: 'STORED',
                version: 1,
                receiverPhone: '13800000000',
                pickupCode: '5678',
                slotId: 'slot1',
              }
            : {
                id: 'p1',
                tenantId: 't1',
                stationId: 's1',
                status: 'PENDING',
                version: 0,
                receiverPhone: '13800000000',
              },
        updateMany,
      },
      slot: { findUnique: async () => ({ id: 'slot1', code: 'A-01' }) },
      parcelEvent: { create: jest.fn() },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const bus = { publish: jest.fn() } as any;
    const service = new ParcelService(tenantPrisma, bus);
    const reservePickupCode = jest
      .fn()
      .mockResolvedValueOnce('1234')
      .mockResolvedValueOnce('5678');

    const out = await runAsTenant(() =>
      service.markStored('p1', { slotId: 'slot1', reservePickupCode }),
    );

    expect(out.status).toBe('STORED');
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(reservePickupCode).toHaveBeenCalledTimes(2);
    expect(out.pickupCode).toBe('5678');
  });

  it('throws clean PICKUP_CODE_CONFLICT after exhausting retries (not a raw 500)', async () => {
    const updateMany = jest.fn(async () => {
      const err: any = new Error('Unique constraint failed');
      err.code = 'P2002';
      throw err;
    });
    const tx = {
      parcel: {
        findUniqueOrThrow: async () => ({
          id: 'p1',
          tenantId: 't1',
          stationId: 's1',
          status: 'PENDING',
          version: 0,
        }),
        updateMany,
      },
      slot: { findUnique: async () => ({ id: 'slot1', code: 'A-01' }) },
      parcelEvent: { create: jest.fn() },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const bus = { publish: jest.fn() } as any;
    const service = new ParcelService(tenantPrisma, bus);
    const reservePickupCode = jest.fn().mockResolvedValue('1234');

    const result = runAsTenant(() =>
      service.markStored('p1', { slotId: 'slot1', reservePickupCode }),
    );
    await expect(result).rejects.toThrow('取件码冲突，请重试');
    await expect(result).rejects.toMatchObject({
      code: ApiCode.PICKUP_CODE_CONFLICT,
    });
    expect(bus.publish).not.toHaveBeenCalled();
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

  it('marks stored parcel EXCEPTION and publishes ParcelMarkedException', async () => {
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
          status: 'EXCEPTION',
          slotId: 'slot1',
        }),
      },
      parcelEvent: { create: jest.fn() },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const bus = { publish: jest.fn() } as any;
    const service = new ParcelService(tenantPrisma, bus);

    await runAsTenant(() =>
      service.markException('p1', {
        type: 'DAMAGED',
        description: '外包装破损',
        exceptionId: 'ex1',
      }),
    );

    expect(tx.parcel.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'STORED', version: 2 },
      data: { status: 'EXCEPTION', version: { increment: 1 } },
    });
    expect(tx.parcelEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 't1',
        parcelId: 'p1',
        fromStatus: 'STORED',
        toStatus: 'EXCEPTION',
        eventType: 'EXCEPTION',
        operatorId: 'u1',
        payload: expect.objectContaining({
          type: 'DAMAGED',
          description: '外包装破损',
          exceptionId: 'ex1',
          slotId: 'slot1',
        }),
      }),
    });
    expect(bus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ParcelMarkedException',
        payload: expect.objectContaining({
          parcelId: 'p1',
          tenantId: 't1',
          stationId: 's1',
          exceptionId: 'ex1',
          type: 'DAMAGED',
        }),
      }),
    );
  });

  it('restocks EXCEPTION parcel back to STORED and resets overdue level', async () => {
    const tx = {
      parcel: {
        findUniqueOrThrow: async () => ({
          id: 'p1',
          tenantId: 't1',
          stationId: 's1',
          status: 'EXCEPTION',
          version: 4,
          slotId: 'slot1',
          lastOverdueLevel: 2,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: async () => ({
          id: 'p1',
          tenantId: 't1',
          stationId: 's1',
          status: 'STORED',
          slotId: 'slot1',
          lastOverdueLevel: 0,
        }),
      },
      parcelEvent: { create: jest.fn() },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const bus = { publish: jest.fn() } as any;
    const service = new ParcelService(tenantPrisma, bus);

    const out = await runAsTenant(() =>
      service.restock('p1', { reason: '异常解除' }),
    );

    expect(out?.status).toBe('STORED');
    expect(tx.parcel.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'EXCEPTION', version: 4 },
      data: {
        status: 'STORED',
        lastOverdueLevel: 0,
        version: { increment: 1 },
      },
    });
    expect(tx.parcelEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 't1',
        parcelId: 'p1',
        fromStatus: 'EXCEPTION',
        toStatus: 'STORED',
        eventType: 'STORED',
        payload: expect.objectContaining({ reason: '异常解除' }),
      }),
    });
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it('returns STORED parcel with returned time and publishes ParcelReturned', async () => {
    const tx = {
      parcel: {
        findUniqueOrThrow: async () => ({
          id: 'p1',
          tenantId: 't1',
          stationId: 's1',
          status: 'STORED',
          version: 5,
          slotId: 'slot1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: async () => ({
          id: 'p1',
          tenantId: 't1',
          stationId: 's1',
          status: 'RETURNED',
          slotId: 'slot1',
        }),
      },
      parcelEvent: { create: jest.fn() },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const bus = { publish: jest.fn() } as any;
    const service = new ParcelService(tenantPrisma, bus);

    await runAsTenant(() =>
      service.returnParcel('p1', { cause: 'OVERDUE', reason: '超期退回' }),
    );

    expect(tx.parcel.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'STORED', version: 5 },
      data: {
        status: 'RETURNED',
        overdueReturnedAt: expect.any(Date),
        version: { increment: 1 },
      },
    });
    expect(tx.parcelEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 't1',
        parcelId: 'p1',
        fromStatus: 'STORED',
        toStatus: 'RETURNED',
        eventType: 'RETURNED',
        payload: expect.objectContaining({
          cause: 'OVERDUE',
          reason: '超期退回',
          slotId: 'slot1',
        }),
      }),
    });
    expect(bus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ParcelReturned',
        payload: expect.objectContaining({
          parcelId: 'p1',
          tenantId: 't1',
          stationId: 's1',
          slotId: 'slot1',
          cause: 'OVERDUE',
        }),
      }),
    );
  });

  it('rejects exception and return transitions from picked up parcel', async () => {
    const tx = {
      parcel: {
        findUniqueOrThrow: async () => ({
          id: 'p1',
          tenantId: 't1',
          stationId: 's1',
          status: 'PICKED_UP',
          version: 1,
        }),
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const bus = { publish: jest.fn() } as any;
    const service = new ParcelService(tenantPrisma, bus);

    await expect(
      runAsTenant(() =>
        service.markException('p1', {
          type: 'DAMAGED',
          description: '破损',
        }),
      ),
    ).rejects.toThrow('包裹状态不可从 PICKED_UP 流转到 EXCEPTION');
    await expect(
      runAsTenant(() =>
        service.returnParcel('p1', { cause: 'EXCEPTION_RETURN' }),
      ),
    ).rejects.toThrow('包裹状态不可从 PICKED_UP 流转到 RETURNED');
    expect(bus.publish).not.toHaveBeenCalled();
  });
});
