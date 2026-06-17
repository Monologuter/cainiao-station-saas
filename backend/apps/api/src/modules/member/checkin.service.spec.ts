import { CheckinService } from './checkin.service';

describe('CheckinService', () => {
  it('creates daily checkin, continues streak and awards points', async () => {
    const tx = {
      member: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'm1',
          lastCheckinDate: new Date('2026-06-17T00:00:00.000Z'),
          continuousCheckinDays: 3,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'm1',
          continuousCheckinDays: 4,
        }),
      },
      memberCheckin: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => ({ id: 'ci1', ...data })),
      },
    };
    const prisma = { $transaction: (fn: any) => fn(tx) } as any;
    const points = { earn: jest.fn().mockResolvedValue({ id: 'pr1' }) } as any;
    const service = new CheckinService(prisma, points);

    const result = await service.checkin(
      'm1',
      new Date('2026-06-18T08:00:00.000Z'),
    );

    expect(points.earn).toHaveBeenCalledWith('m1', 4, 'CHECKIN', {
      refType: 'checkin',
      refId: '2026-06-18',
      idempotencyKey: 'checkin:m1:2026-06-18',
      remark: '每日签到',
    });
    expect(result).toMatchObject({
      checkedIn: true,
      rewardPoints: 4,
      continuousDays: 4,
      pointRecordId: 'pr1',
    });
  });

  it('returns existing status when checking in repeatedly on same day', async () => {
    const tx = {
      memberCheckin: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ci1',
          checkinDate: new Date('2026-06-18T00:00:00.000Z'),
          rewardPoints: 2,
          continuousDays: 2,
          pointRecordId: 'pr1',
        }),
      },
    };
    const service = new CheckinService(
      { $transaction: (fn: any) => fn(tx) } as any,
      { earn: jest.fn() } as any,
    );

    await expect(
      service.checkin('m1', new Date('2026-06-18T12:00:00.000Z')),
    ).resolves.toMatchObject({
      checkedIn: true,
      rewardPoints: 2,
      continuousDays: 2,
      pointRecordId: 'pr1',
      repeated: true,
    });
  });

  it('resets streak after a missed day and returns monthly status', async () => {
    const tx = {
      member: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'm1',
          lastCheckinDate: new Date('2026-06-10T00:00:00.000Z'),
          continuousCheckinDays: 8,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      memberCheckin: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => ({ id: 'ci1', ...data })),
        findMany: jest
          .fn()
          .mockResolvedValue([
            { checkinDate: new Date('2026-06-01T00:00:00.000Z') },
            { checkinDate: new Date('2026-06-18T00:00:00.000Z') },
          ]),
      },
    };
    const prisma = { $transaction: (fn: any) => fn(tx) } as any;
    const points = { earn: jest.fn().mockResolvedValue({ id: 'pr1' }) } as any;
    const service = new CheckinService(prisma, points);

    const result = await service.checkin(
      'm1',
      new Date('2026-06-18T08:00:00.000Z'),
    );
    expect(result.continuousDays).toBe(1);
    expect(result.rewardPoints).toBe(1);

    await expect(
      service.getStatus('m1', '2026-06', new Date('2026-06-18T12:00:00.000Z')),
    ).resolves.toEqual({
      checkedToday: true,
      dates: ['2026-06-01', '2026-06-18'],
    });
  });
});
