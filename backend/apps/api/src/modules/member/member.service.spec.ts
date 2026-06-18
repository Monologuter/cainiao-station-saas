import { MemberService } from './member.service';

describe('MemberService profile', () => {
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
  });

  it('issues a random Redis-backed OTP and consumes it once', async () => {
    const redis = makeRedis();
    const prisma = {
      consumer: {
        upsert: jest.fn().mockResolvedValue({ id: 'c1', phone: '13800000000' }),
      },
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('pick-token') };
    const service = new MemberService(prisma as any, jwt as any, redis as any);

    const sent = await service.sendCode('13800000000');
    const otp = redis.valueFor('consumer:otp:13800000000');

    expect(sent).toMatchObject({ sent: true, expiresInSeconds: 300 });
    expect(otp).toMatch(/^\d{6}$/);
    expect(otp).not.toBe('123456');

    await expect(service.verifyCode('13800000000', otp)).resolves.toEqual({
      pickToken: 'pick-token',
      consumerId: 'c1',
    });
    await expect(service.verifyCode('13800000000', otp)).rejects.toMatchObject({
      code: 1002,
    });
  });

  it('rejects the fixed mock code in production', async () => {
    process.env.NODE_ENV = 'production';
    const redis = makeRedis();
    const service = new MemberService({} as any, {} as any, redis as any);

    await expect(
      service.verifyCode('13800000000', '123456'),
    ).rejects.toMatchObject({ code: 1002 });
  });

  it('creates member profile once for consumer', async () => {
    const tx = {
      consumer: {
        upsert: jest.fn().mockResolvedValue({ id: 'c1', phone: '13800000000' }),
      },
      member: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => ({
          id: 'm1',
          level: 0,
          totalPoints: 0,
          availablePoints: 0,
          frozenPoints: 0,
          continuousCheckinDays: 0,
          ...data,
        })),
      },
    };
    const prisma = { $transaction: (fn: any) => fn(tx) } as any;
    const service = new MemberService(prisma, {} as any, makeRedis() as any);

    const member = await service.ensureMember('c1', '13800000000');

    expect(member).toMatchObject({
      id: 'm1',
      consumerId: 'c1',
      phone: '13800000000',
      level: 0,
    });
    expect(tx.member.create).toHaveBeenCalledTimes(1);
  });

  it('returns existing member without creating duplicate', async () => {
    const existing = {
      id: 'm1',
      consumerId: 'c1',
      phone: '13800000000',
      level: 1,
    };
    const tx = {
      consumer: { upsert: jest.fn() },
      member: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    };
    const prisma = { $transaction: (fn: any) => fn(tx) } as any;
    const service = new MemberService(prisma, {} as any, makeRedis() as any);

    await expect(service.ensureMember('c1', '13800000000')).resolves.toBe(
      existing,
    );
    expect(tx.member.create).not.toHaveBeenCalled();
  });

  it('returns profile with next level progress', async () => {
    const tx = {
      member: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'm1',
          level: 1,
          totalPoints: 260,
          availablePoints: 120,
          frozenPoints: 0,
          continuousCheckinDays: 3,
          lastCheckinDate: new Date('2026-06-17T00:00:00Z'),
        }),
      },
    };
    const prisma = { $transaction: (fn: any) => fn(tx) } as any;
    const service = new MemberService(prisma, {} as any, makeRedis() as any);

    await expect(service.getProfile('m1')).resolves.toMatchObject({
      id: 'm1',
      level: 1,
      totalPoints: 260,
      availablePoints: 120,
      nextLevel: 2,
      nextLevelMinPoints: 500,
      pointsToNextLevel: 240,
      continuousCheckinDays: 3,
    });
  });

  it('recalculates member level from total points', async () => {
    const tx = {
      member: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'm1',
          level: 0,
          totalPoints: 500,
        }),
        update: jest.fn().mockResolvedValue({ id: 'm1', level: 2 }),
      },
    };
    const prisma = { $transaction: (fn: any) => fn(tx) } as any;
    const service = new MemberService(prisma, {} as any, makeRedis() as any);

    await expect(service.recalcLevel('m1')).resolves.toBe(2);
    expect(tx.member.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { level: 2 },
    });
  });
});

function makeRedis() {
  const store = new Map<string, string>();
  return {
    getClient: () => ({
      set: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      del: jest.fn(async (key: string) => {
        const existed = store.delete(key);
        return existed ? 1 : 0;
      }),
    }),
    valueFor: (key: string) => store.get(key),
  };
}
