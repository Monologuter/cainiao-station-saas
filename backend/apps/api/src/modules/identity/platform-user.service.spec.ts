import { PlatformUserService } from './platform-user.service';

describe('PlatformUserService', () => {
  it('lists platform users with role codes', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn(),
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'u1',
            username: 'admin',
            phone: null,
            status: 'active',
            roles: [{ role: { code: '平台超管' } }],
            createdAt: new Date('2026-06-18T00:00:00.000Z'),
          },
        ]),
      },
    };
    const service = new PlatformUserService({
      $transaction: (fn: any) => fn(tx),
    } as any);

    await expect(service.list()).resolves.toMatchObject({
      total: 1,
      list: [{ id: 'u1', username: 'admin', roles: ['平台超管'] }],
    });
  });

  it('replaces platform roles when updating a user', async () => {
    const tx = {
      $executeRawUnsafe: jest.fn(),
      user: {
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'u1',
          username: 'ops',
          status: 'active',
          roles: [{ role: { code: '运营' } }],
          createdAt: new Date('2026-06-18T00:00:00.000Z'),
        }),
      },
      userRole: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      role: {
        findMany: jest.fn().mockResolvedValue([{ id: 'r1', code: '运营' }]),
      },
    };
    const service = new PlatformUserService({
      $transaction: (fn: any) => fn(tx),
    } as any);

    await service.update('u1', { roleCodes: ['运营'], status: 'active' });

    expect(tx.userRole.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
    expect(tx.userRole.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'u1', roleId: 'r1' }],
      skipDuplicates: true,
    });
  });
});
