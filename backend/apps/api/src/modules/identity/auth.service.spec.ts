import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

function redisMock() {
  const client = {
    set: jest.fn(),
    sadd: jest.fn(),
    expire: jest.fn(),
  };
  return { redis: { getClient: () => client } as any, client };
}

describe('AuthService.validate', () => {
  it('valid password returns user payload', async () => {
    const hash = await argon2.hash('pw123456');
    const tx = {
      $executeRawUnsafe: jest.fn(),
      user: {
        findFirst: async () => ({
          id: 'u1',
          tenantId: 't1',
          username: 'boss',
          passwordHash: hash,
          type: 'STAFF',
          roles: [{ role: { code: '店长' } }],
        }),
      },
    };
    const prisma = { $transaction: async (fn: any) => fn(tx) } as any;
    const jwt = { signAsync: async () => 'tok' } as any;
    const { redis, client } = redisMock();

    const svc = new AuthService(prisma, jwt, redis);
    const out = await svc.login('boss', 'pw123456');

    expect(out.accessToken).toBe('tok');
    expect(out.refreshToken).toBe('tok');
    expect(client.set).toHaveBeenCalled();
    expect(out.user.roles).toContain('店长');
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      `SELECT set_config('app.bypass_rls', 'on', true)`,
    );
  });

  it('wrong password throws', async () => {
    const hash = await argon2.hash('right');
    const tx = {
      $executeRawUnsafe: jest.fn(),
      user: {
        findFirst: async () => ({
          id: 'u1',
          username: 'x',
          passwordHash: hash,
          type: 'STAFF',
          tenantId: 't1',
          roles: [],
        }),
      },
    };
    const prisma = { $transaction: async (fn: any) => fn(tx) } as any;
    const jwt = { signAsync: async () => 'tok' } as any;
    const { redis } = redisMock();

    const svc = new AuthService(prisma, jwt, redis);

    await expect(svc.login('x', 'wrong')).rejects.toThrow();
  });
});
