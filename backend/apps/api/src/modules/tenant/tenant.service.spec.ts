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

  it('publishes StationCreated after direct tenant creation commits', async () => {
    const tx = {
      tenant: {
        create: async ({ data }: any) => ({ id: 't1', ...data }),
      },
      station: {
        create: async ({ data }: any) => ({ id: 's1', ...data }),
      },
      role: { create: async ({ data }: any) => ({ id: 'r1', ...data }) },
      permission: {
        upsert: async ({ create }: any) => create,
        findMany: async () => [{ id: 'p1' }],
      },
      rolePermission: { createMany: async () => ({ count: 1 }) },
      user: {
        create: async ({ data }: any) => ({ id: 'u1', ...data }),
      },
      userRole: { create: async () => ({}) },
      priceRule: {
        createMany: async ({ data }: any) => ({ count: data.length }),
      },
      $executeRawUnsafe: jest.fn(),
    };
    const prisma = { $transaction: async (fn: any) => fn(tx) } as any;
    const eventBus = { publish: jest.fn() };
    const svc = new TenantService(prisma, eventBus as any);

    await svc.createTenant({
      name: '城南驿站',
      ownerName: '张三',
      ownerPhone: '13800000000',
      ownerPassword: 'pw123456',
    });

    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'StationCreated',
        payload: { tenantId: 't1', stationId: 's1' },
      }),
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
        count: jest.fn().mockResolvedValue(42),
      },
    };
    const svc = new TenantService({
      $transaction: (fn: any) => fn(tx),
    } as any);

    await expect(
      svc.listTenants({ status: 'ACTIVE', page: '2', size: '10' }),
    ).resolves.toMatchObject({
      total: 42,
      page: 2,
      size: 10,
      list: [
        {
          id: 't1',
          stationCount: 1,
          userCount: 2,
        },
      ],
    });
    expect(tx.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE' },
        skip: 10,
        take: 10,
      }),
    );
    expect(tx.tenant.count).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
    });
  });

  it('lists tenants with keyword search', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn(),
      tenant: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const svc = new TenantService({
      $transaction: (fn: any) => fn(tx),
    } as any);

    await svc.listTenants({ keyword: '城南', page: '1', size: '20' });

    const expectedWhere = {
      OR: [
        { name: { contains: '城南', mode: 'insensitive' } },
        { ownerName: { contains: '城南', mode: 'insensitive' } },
        { contactPhone: { contains: '城南' } },
      ],
    };
    expect(tx.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(tx.tenant.count).toHaveBeenCalledWith({ where: expectedWhere });
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
