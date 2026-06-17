import { ApiCode, BizError } from '../../../core/http/api-code';
import { SubscriptionService } from './subscription.service';

function createSubscriptionService() {
  const plan = {
    id: 'plan-1',
    monthlyPrice: BigInt(9900),
    quotas: { sms: 100 },
    overagePrices: { sms: 10 },
  };
  const existingSubscription = {
    id: 'sub-1',
    tenantId: 't1',
    stationId: 's1',
    planId: 'plan-1',
    status: 'ACTIVE',
    currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
    nextBillingAt: new Date('2026-07-01T00:00:00.000Z'),
    planSnapshot: { monthlyPrice: 9900 },
  };
  const tx = {
    billingPlan: { findFirst: jest.fn().mockResolvedValue(plan) },
    subscription: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(existingSubscription),
      create: jest.fn().mockResolvedValue(existingSubscription),
      update: jest.fn().mockResolvedValue(existingSubscription),
      findMany: jest.fn().mockResolvedValue([existingSubscription]),
    },
  };
  const tenantPrisma = { withTenant: (fn: any) => fn(tx) } as any;
  return {
    service: new SubscriptionService(tenantPrisma),
    tx,
    plan,
    existingSubscription,
  };
}

describe('SubscriptionService', () => {
  it('subscribes a tenant station with a frozen plan snapshot', async () => {
    const { service, tx } = createSubscriptionService();

    await service.subscribe({
      tenantId: 't1',
      stationId: 's1',
      planId: 'plan-1',
      now: new Date('2026-06-18T00:00:00.000Z'),
    });

    expect(tx.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 't1',
          stationId: 's1',
          planId: 'plan-1',
          status: 'ACTIVE',
          planSnapshot: {
            monthlyPrice: 9900,
            quotas: { sms: 100 },
            overagePrices: { sms: 10 },
          },
        }),
      }),
    );
  });

  it('rejects duplicate active subscriptions for one station', async () => {
    const { service, tx, existingSubscription } = createSubscriptionService();
    tx.subscription.findFirst.mockResolvedValue(existingSubscription);

    await expect(
      service.subscribe({ tenantId: 't1', stationId: 's1', planId: 'plan-1' }),
    ).rejects.toMatchObject(
      new BizError(ApiCode.BAD_REQUEST, '门店已有有效订阅'),
    );
  });

  it('renews by rolling the current period forward', async () => {
    const { service, tx } = createSubscriptionService();

    await service.renew('sub-1');

    expect(tx.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: expect.objectContaining({
          currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
          currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
          nextBillingAt: new Date('2026-08-01T00:00:00.000Z'),
          status: 'ACTIVE',
        }),
      }),
    );
  });

  it('guards illegal lifecycle transitions', async () => {
    const { service, tx, existingSubscription } = createSubscriptionService();
    tx.subscription.findUnique.mockResolvedValue({
      ...existingSubscription,
      status: 'CANCELED',
    });

    await expect(service.resume('sub-1')).rejects.toMatchObject(
      new BizError(ApiCode.ILLEGAL_TRANSITION, '订阅状态不允许恢复'),
    );
  });
});
