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
});
