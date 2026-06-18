import { TenantService } from './tenant.service';

describe('TenantService.createTenant', () => {
  it('creates tenant + default station + 店长 user with 店长 role', async () => {
    const created: any = {};
    const tx = {
      tenant: {
        create: async ({ data }: any) =>
          (created.tenant = { id: 't1', ...data }),
      },
      station: {
        create: async ({ data }: any) =>
          (created.station = { id: 's1', ...data }),
      },
      role: { create: async ({ data }: any) => ({ id: 'r1', ...data }) },
      permission: {
        upsert: async ({ create }: any) => create,
        findMany: async () => [{ id: 'p1' }, { id: 'p2' }],
      },
      rolePermission: { createMany: async () => ({ count: 2 }) },
      user: {
        create: async ({ data }: any) => (created.user = { id: 'u1', ...data }),
      },
      userRole: { create: async () => ({}) },
      priceRule: {
        createMany: async ({ data }: any) => ({ count: data.length }),
      },
      $executeRawUnsafe: jest.fn(),
    };
    const prisma = { $transaction: async (fn: any) => fn(tx) } as any;
    const svc = new TenantService(prisma);

    const out = await svc.createTenant({
      name: '城南驿站',
      ownerName: '张三',
      ownerPhone: '13800000000',
      ownerPassword: 'pw123456',
    });

    expect(out.tenantId).toBe('t1');
    expect(created.station.tenantId).toBe('t1');
    expect(created.user.tenantId).toBe('t1');
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      `SELECT set_config('app.bypass_rls', 'on', true)`,
    );
  });

  it('lists tenants with station and user counts', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn(),
      tenant: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 't1',
            name: '城南驿站',
            ownerName: '张三',
            contactPhone: '13800000000',
            status: 'ACTIVE',
            stations: [{ id: 's1' }],
            users: [{ id: 'u1' }, { id: 'u2' }],
            createdAt: new Date('2026-06-18T00:00:00.000Z'),
          },
        ]),
      },
    };
    const svc = new TenantService({
      $transaction: (fn: any) => fn(tx),
    } as any);

    await expect(svc.listTenants({ status: 'ACTIVE' })).resolves.toMatchObject({
      total: 1,
      list: [
        {
          id: 't1',
          stationCount: 1,
          userCount: 2,
        },
      ],
    });
    expect(tx.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE' } }),
    );
  });

  it('updates tenant status from platform admin flow', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn(),
      tenant: {
        update: jest.fn().mockResolvedValue({ id: 't1', status: 'SUSPENDED' }),
      },
    };
    const svc = new TenantService({
      $transaction: (fn: any) => fn(tx),
    } as any);

    await expect(svc.updateStatus('t1', 'SUSPENDED')).resolves.toMatchObject({
      id: 't1',
      status: 'SUSPENDED',
    });
  });
});
