import { BizError } from '../../core/http/api-code';
import { PointService } from './point.service';

function createService() {
  const tx = {
    pointRecord: {
      findUnique: jest.fn(),
      create: jest.fn(async ({ data }: any) => ({ id: 'pr1', ...data })),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    member: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  };
  const prisma = { $transaction: (fn: any) => fn(tx) } as any;
  const redisClient = {
    zincrby: jest.fn(),
    zrevrange: jest.fn(),
    zrevrank: jest.fn(),
    zscore: jest.fn(),
  };
  const redis = { getClient: () => redisClient } as any;
  return { service: new PointService(prisma, redis), tx, redisClient };
}

describe('PointService', () => {
  it('earns points with ledger, balance snapshot and rank increment', async () => {
    const { service, tx, redisClient } = createService();
    tx.pointRecord.findUnique.mockResolvedValue(null);
    tx.member.update.mockResolvedValue({
      id: 'm1',
      totalPoints: 12,
      availablePoints: 12,
    });

    const record = await service.earn('m1', 2, 'PICKUP', {
      sourceTenantId: 't1',
      refType: 'parcel',
      refId: 'p1',
      idempotencyKey: 'pickup:p1',
      remark: '取件积分',
    });

    expect(record).toMatchObject({
      memberId: 'm1',
      change: 2,
      balanceAfter: 12,
      type: 'PICKUP',
      sourceTenantId: 't1',
      refType: 'parcel',
      refId: 'p1',
      idempotencyKey: 'pickup:p1',
    });
    expect(tx.member.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: {
        totalPoints: { increment: 2 },
        availablePoints: { increment: 2 },
      },
    });
    expect(redisClient.zincrby).toHaveBeenCalledWith('rank:points:t1', 2, 'm1');
  });

  it('dedups earn by idempotency key', async () => {
    const existing = { id: 'pr-old', idempotencyKey: 'pickup:p1' };
    const { service, tx, redisClient } = createService();
    tx.pointRecord.findUnique.mockResolvedValue(existing);

    await expect(
      service.earn('m1', 2, 'PICKUP', {
        sourceTenantId: 't1',
        idempotencyKey: 'pickup:p1',
      }),
    ).resolves.toBe(existing);
    expect(tx.member.update).not.toHaveBeenCalled();
    expect(redisClient.zincrby).not.toHaveBeenCalled();
  });

  it('spends points and rejects insufficient balance', async () => {
    const { service, tx } = createService();
    tx.pointRecord.findUnique.mockResolvedValue(null);
    tx.member.findUniqueOrThrow.mockResolvedValue({
      id: 'm1',
      availablePoints: 3,
    });

    await expect(
      service.spend('m1', 5, 'COUPON_REDEEM', {
        idempotencyKey: 'redeem:c1',
      }),
    ).rejects.toBeInstanceOf(BizError);
    expect(tx.pointRecord.create).not.toHaveBeenCalled();

    tx.member.findUniqueOrThrow.mockResolvedValue({
      id: 'm1',
      availablePoints: 8,
    });
    tx.member.update.mockResolvedValue({ id: 'm1', availablePoints: 3 });

    const record = await service.spend('m1', 5, 'COUPON_REDEEM', {
      idempotencyKey: 'redeem:c1',
      refType: 'coupon',
      refId: 'c1',
    });
    expect(record).toMatchObject({
      memberId: 'm1',
      change: -5,
      balanceAfter: 3,
      type: 'COUPON_REDEEM',
    });
  });

  it('returns leaderboard top and self rank from Redis zset', async () => {
    const { service, redisClient } = createService();
    redisClient.zrevrange.mockResolvedValue(['m2', '20', 'm1', '12']);
    redisClient.zrevrank.mockResolvedValue(1);
    redisClient.zscore.mockResolvedValue('12');

    await expect(service.getRank('t1', 'm1')).resolves.toEqual({
      top: [
        { memberId: 'm2', score: 20, rank: 1 },
        { memberId: 'm1', score: 12, rank: 2 },
      ],
      self: { memberId: 'm1', score: 12, rank: 2 },
    });
  });

  it('derives leaderboard tenant from member records and masks member ids', async () => {
    const { service, tx, redisClient } = createService();
    tx.pointRecord.findFirst.mockResolvedValue({ sourceTenantId: 't1' });
    redisClient.zrevrange.mockResolvedValue(['member-top-2', '20', 'm1', '12']);
    redisClient.zrevrank.mockResolvedValue(1);
    redisClient.zscore.mockResolvedValue('12');

    await expect(service.getRankForMember('m1')).resolves.toEqual({
      top: [
        { memberId: 'mem***p-2', score: 20, rank: 1 },
        { memberId: 'm***1', score: 12, rank: 2 },
      ],
      self: { memberId: 'm***1', score: 12, rank: 2 },
    });
    expect(tx.pointRecord.findFirst).toHaveBeenCalledWith({
      where: {
        memberId: 'm1',
        sourceTenantId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { sourceTenantId: true },
    });
  });
});
