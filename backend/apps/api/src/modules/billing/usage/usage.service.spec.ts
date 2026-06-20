import { ApiCode, BizError } from '../../../core/http/api-code';
import { UsageService } from './usage.service';

function createUsageService() {
  const subscription = {
    id: 'sub-1',
    tenantId: 'tenant-1',
    stationId: 'station-1',
    status: 'ACTIVE',
    currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
  };
  const usageRecord = {
    id: 'usage-1',
    tenantId: 'tenant-1',
    subscriptionId: 'sub-1',
    periodStart: subscription.currentPeriodStart,
    metric: 'SMS',
    quantity: BigInt(3),
  };
  const tx = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    subscription: {
      findFirst: jest.fn().mockResolvedValue(subscription),
    },
    usageDedup: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    usageRecord: {
      upsert: jest.fn().mockResolvedValue(usageRecord),
      findMany: jest.fn().mockResolvedValue([usageRecord]),
    },
  };
  const tenantPrisma = { withTenant: (fn: any) => fn(tx) } as any;
  return { service: new UsageService(tenantPrisma), tx, subscription };
}

describe('UsageService', () => {
  it('meters usage into the active subscription period bucket', async () => {
    const { service, tx, subscription } = createUsageService();

    const result = await service.meter({
      tenantId: 'tenant-1',
      stationId: 'station-1',
      eventId: 'evt-1',
      metric: 'SMS',
      quantity: 3,
      eventAt: new Date('2026-06-18T08:00:00.000Z'),
    });

    expect(tx.subscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          stationId: 'station-1',
          status: { in: ['ACTIVE', 'PAST_DUE'] },
          currentPeriodStart: { lte: new Date('2026-06-18T08:00:00.000Z') },
          currentPeriodEnd: { gt: new Date('2026-06-18T08:00:00.000Z') },
          deletedAt: null,
        }),
      }),
    );
    expect(tx.usageDedup.createMany).toHaveBeenCalledWith({
      data: [
        {
          tenantId: 'tenant-1',
          eventId: 'evt-1',
          subscriptionId: subscription.id,
          metric: 'SMS',
        },
      ],
      skipDuplicates: true,
    });
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT id FROM "subscriptions" WHERE id = $1 FOR UPDATE',
      subscription.id,
    );
    expect(tx.usageRecord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          subscriptionId_periodStart_metric: {
            subscriptionId: subscription.id,
            periodStart: subscription.currentPeriodStart,
            metric: 'SMS',
          },
        },
        update: {
          quantity: { increment: BigInt(3) },
          lastEventAt: new Date('2026-06-18T08:00:00.000Z'),
        },
        create: expect.objectContaining({
          tenantId: 'tenant-1',
          subscriptionId: subscription.id,
          periodStart: subscription.currentPeriodStart,
          metric: 'SMS',
          quantity: BigInt(3),
        }),
      }),
    );
    expect(result).toMatchObject({ counted: true, quantity: 3 });
  });

  it('does not count the same event twice', async () => {
    const { service, tx } = createUsageService();
    tx.usageDedup.createMany.mockResolvedValue({ count: 0 });

    const result = await service.meter({
      tenantId: 'tenant-1',
      stationId: 'station-1',
      eventId: 'evt-1',
      metric: 'SMS',
      quantity: 1,
      eventAt: new Date('2026-06-18T08:00:00.000Z'),
    });

    expect(tx.usageRecord.upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ counted: false, duplicate: true });
  });

  it('rejects metering when no active subscription covers the event time', async () => {
    const { service, tx } = createUsageService();
    tx.subscription.findFirst.mockResolvedValue(null);

    await expect(
      service.meter({
        tenantId: 'tenant-1',
        stationId: 'station-1',
        eventId: 'evt-1',
        metric: 'SMS',
        quantity: 1,
        eventAt: new Date('2026-06-18T08:00:00.000Z'),
      }),
    ).rejects.toMatchObject(new BizError(ApiCode.NOT_FOUND, '未找到有效订阅'));
  });
});
