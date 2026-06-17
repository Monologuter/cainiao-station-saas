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
      service.resolve('ex1', { resolution: 'RESTOCK', note: '可重新入库' }),
    );

    expect(parcels.restock).toHaveBeenCalledWith('p1', {
      reason: '可重新入库',
    });
    expect(parcels.returnParcel).not.toHaveBeenCalled();
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
      service.resolve('ex1', { resolution: 'RETURN', note: '退回快递员' }),
    );

    expect(parcels.returnParcel).toHaveBeenCalledWith('p1', {
      cause: 'EXCEPTION_RETURN',
      reason: '退回快递员',
    });
  });

  it('resolves ownerless VOID ticket without touching parcel service', async () => {
    const tx = {
      exceptionTicket: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'ex1',
          status: 'IN_PROGRESS',
          parcelId: null,
        }),
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
