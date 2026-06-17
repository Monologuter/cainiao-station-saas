import { MemberService } from './member.service';

describe('MemberService profile', () => {
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
    const service = new MemberService(prisma, {} as any);

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
    const service = new MemberService(prisma, {} as any);

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
    const service = new MemberService(prisma, {} as any);

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
    const service = new MemberService(prisma, {} as any);

    await expect(service.recalcLevel('m1')).resolves.toBe(2);
    expect(tx.member.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { level: 2 },
    });
  });
});
