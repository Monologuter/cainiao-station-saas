import { TenantContext } from '../../core/tenant-context/tenant-context';
import { ExceptionService } from './exception.service';

function runAsTenant<T>(fn: () => T) {
  return TenantContext.run(
    { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
    fn,
  );
}

describe('ExceptionService', () => {
  it('creates ticket and marks parcel exception when parcel is provided', async () => {
    const created: any = {};
    const tx = {
      parcel: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'p1',
          stationId: 's1',
          status: 'STORED',
        }),
      },
      exceptionTicket: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => {
          created.ticket = { id: 'ex1', status: 'OPEN', ...data };
          return created.ticket;
        }),
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const parcels = { markException: jest.fn() } as any;
    const service = new ExceptionService(tenantPrisma, parcels);

    const out = await runAsTenant(() =>
      service.createException({
        parcelId: 'p1',
        stationId: 's1',
        type: 'DAMAGED',
        severity: 'HIGH',
        description: '外包装破损',
        evidenceUrls: ['mock://photo'],
      }),
    );

    expect(out.id).toBe('ex1');
    expect(created.ticket).toMatchObject({
      tenantId: 't1',
      stationId: 's1',
      parcelId: 'p1',
      type: 'DAMAGED',
      severity: 'HIGH',
      description: '外包装破损',
      evidenceUrls: ['mock://photo'],
      parcelStatusBefore: 'STORED',
      createdBy: 'u1',
    });
    expect(created.ticket.code).toMatch(/^EX-\d{8}-/);
    expect(parcels.markException).toHaveBeenCalledWith('p1', {
      type: 'DAMAGED',
      description: '外包装破损',
      severity: 'HIGH',
      evidenceUrls: ['mock://photo'],
      exceptionId: 'ex1',
    });
  });

  it('rejects duplicate unresolved ticket for same parcel', async () => {
    const tx = {
      parcel: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'p1',
          stationId: 's1',
          status: 'STORED',
        }),
      },
      exceptionTicket: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ex-old' }),
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const parcels = { markException: jest.fn() } as any;
    const service = new ExceptionService(tenantPrisma, parcels);

    await expect(
      runAsTenant(() =>
        service.createException({
          parcelId: 'p1',
          stationId: 's1',
          type: 'DAMAGED',
          description: '外包装破损',
        }),
      ),
    ).rejects.toThrow('包裹已有未结异常工单');
    expect(parcels.markException).not.toHaveBeenCalled();
  });

  it('claims OPEN ticket as IN_PROGRESS', async () => {
    const tx = {
      exceptionTicket: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'ex1',
          status: 'OPEN',
        }),
        update: jest.fn(async ({ data }: any) => ({
          id: 'ex1',
          status: 'IN_PROGRESS',
          ...data,
        })),
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const service = new ExceptionService(tenantPrisma, {} as any);

    const out = await runAsTenant(() => service.claim('ex1', 'u2'));

    expect(out).toMatchObject({ status: 'IN_PROGRESS', assigneeId: 'u2' });
    expect(tx.exceptionTicket.update).toHaveBeenCalledWith({
      where: { id: 'ex1' },
      data: { status: 'IN_PROGRESS', assigneeId: 'u2' },
    });
  });

  it('resolves RESTOCK ticket and restocks parcel', async () => {
    const tx = {
      exceptionTicket: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'ex1',
          status: 'IN_PROGRESS',
          parcelId: 'p1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(async ({ data }: any) => ({
          id: 'ex1',
          status: 'RESOLVED',
          ...data,
        })),
      },
      parcel: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'p1',
          tenantId: 't1',
          stationId: 's1',
          status: 'EXCEPTION',
          version: 3,
          slotId: 'slot1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: 'p1', status: 'STORED' }),
      },
      parcelEvent: { create: jest.fn() },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const parcels = { restock: jest.fn(), returnParcel: jest.fn() } as any;
    const service = new ExceptionService(tenantPrisma, parcels);

    await runAsTenant(() =>
      service.resolve('ex1', { resolution: 'RESTOCK', note: '可重新入库' }),
    );

    expect(parcels.restock).not.toHaveBeenCalled();
    expect(parcels.returnParcel).not.toHaveBeenCalled();
    expect(tx.exceptionTicket.updateMany).toHaveBeenCalledWith({
      where: { id: 'ex1', status: 'IN_PROGRESS' },
      data: expect.objectContaining({
        status: 'RESOLVED',
        resolution: 'RESTOCK',
      }),
    });
    expect(tx.parcel.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'EXCEPTION', version: 3 },
      data: expect.objectContaining({
        status: 'STORED',
        lastOverdueLevel: 0,
        version: { increment: 1 },
      }),
    });
    expect(tx.exceptionTicket.update).toHaveBeenCalledWith({
      where: { id: 'ex1' },
      data: expect.objectContaining({
        status: 'RESOLVED',
        resolution: 'RESTOCK',
        resolutionNote: '可重新入库',
        resolvedAt: expect.any(Date),
      }),
    });
  });

  it('resolves RETURN ticket and returns parcel', async () => {
    const tx = {
      exceptionTicket: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'ex1',
          status: 'IN_PROGRESS',
          parcelId: 'p1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(async ({ data }: any) => ({
          id: 'ex1',
          status: 'RESOLVED',
          ...data,
        })),
      },
      parcel: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'p1',
          tenantId: 't1',
          stationId: 's1',
          status: 'EXCEPTION',
          version: 3,
          slotId: 'slot1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: 'p1', status: 'RETURNED' }),
      },
      slot: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      parcelEvent: { create: jest.fn() },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const parcels = { restock: jest.fn(), returnParcel: jest.fn() } as any;
    const service = new ExceptionService(tenantPrisma, parcels);

    await runAsTenant(() =>
      service.resolve('ex1', { resolution: 'RETURN', note: '退回快递员' }),
    );

    expect(parcels.returnParcel).not.toHaveBeenCalled();
    expect(tx.parcel.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'EXCEPTION', version: 3 },
      data: expect.objectContaining({
        status: 'RETURNED',
        overdueReturnedAt: expect.any(Date),
        version: { increment: 1 },
      }),
    });
  });

  it('does not compensate twice when concurrent resolve already won', async () => {
    const tx = {
      exceptionTicket: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'ex1',
          status: 'IN_PROGRESS',
          parcelId: 'p1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
      parcel: { updateMany: jest.fn() },
      parcelEvent: { create: jest.fn() },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const service = new ExceptionService(tenantPrisma, {} as any);

    await expect(
      runAsTenant(() =>
        service.resolve('ex1', { resolution: 'RETURN', note: '退回快递员' }),
      ),
    ).rejects.toThrow('异常工单已被处理');

    expect(tx.parcel.updateMany).not.toHaveBeenCalled();
    expect(tx.exceptionTicket.update).not.toHaveBeenCalled();
  });

  it('resolves ownerless VOID ticket without touching parcel service', async () => {
    const tx = {
      exceptionTicket: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'ex1',
          status: 'IN_PROGRESS',
          parcelId: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(async ({ data }: any) => ({
          id: 'ex1',
          status: 'RESOLVED',
          ...data,
        })),
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const parcels = { restock: jest.fn(), returnParcel: jest.fn() } as any;
    const service = new ExceptionService(tenantPrisma, parcels);

    await runAsTenant(() =>
      service.resolve('ex1', { resolution: 'VOID', note: '无主件作废' }),
    );

    expect(parcels.restock).not.toHaveBeenCalled();
    expect(parcels.returnParcel).not.toHaveBeenCalled();
  });
});

describe('ExceptionService.list 门店数据范围', () => {
  function makeService() {
    const lastWhere: any = {};
    const tx = {
      exceptionTicket: {
        count: jest.fn(async ({ where }: any) => {
          lastWhere.value = where;
          return 0;
        }),
        findMany: jest.fn(async ({ where }: any) => {
          lastWhere.value = where;
          return [];
        }),
      },
    };
    const tenantPrisma = { withTenant: async (fn: any) => fn(tx) } as any;
    const service = new ExceptionService(tenantPrisma, {} as any);
    return { service, lastWhere };
  }

  function runAs<T>(ctx: any, fn: () => T) {
    return TenantContext.run(ctx, fn);
  }

  it('店员不传 stationId → 收敛为被分配门店集合', async () => {
    const { service, lastWhere } = makeService();
    await runAs(
      {
        userId: 'u1',
        tenantId: 't1',
        roles: ['店员'],
        isPlatform: false,
        allStations: false,
        stations: ['s1', 's2'],
      },
      () => service.list({}),
    );
    expect(lastWhere.value.stationId).toEqual({ in: ['s1', 's2'] });
  });

  it('店员传被分配门店 → 仅该门店', async () => {
    const { service, lastWhere } = makeService();
    await runAs(
      {
        userId: 'u1',
        tenantId: 't1',
        roles: ['店员'],
        isPlatform: false,
        allStations: false,
        stations: ['s1', 's2'],
      },
      () => service.list({ stationId: 's1' }),
    );
    expect(lastWhere.value.stationId).toBe('s1');
  });

  it('店员传非分配门店 → 拒绝（越权）', async () => {
    const { service } = makeService();
    await expect(
      runAs(
        {
          userId: 'u1',
          tenantId: 't1',
          roles: ['店员'],
          isPlatform: false,
          allStations: false,
          stations: ['s1', 's2'],
        },
        () => service.list({ stationId: 's9' }),
      ),
    ).rejects.toThrow('无权访问该门店数据');
  });

  it('店长可见全租户门店 → 不追加 stationId 过滤', async () => {
    const { service, lastWhere } = makeService();
    await runAs(
      {
        userId: 'boss',
        tenantId: 't1',
        roles: ['店长'],
        isPlatform: false,
        allStations: true,
        stations: [],
      },
      () => service.list({}),
    );
    expect(lastWhere.value.stationId).toBeUndefined();
  });
});
