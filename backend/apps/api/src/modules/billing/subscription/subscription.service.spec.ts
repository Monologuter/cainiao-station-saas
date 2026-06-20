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
    planSnapshot: { monthlyPrice: 9900, quotas: { sms: 100 }, overagePrices: { sms: 10 } },
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
    invoice: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn((args: any) => Promise.resolve({ id: 'adj-1', ...args.data })),
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

  it('rejects changePlan for a CANCELED subscription', async () => {
    const { service, tx, existingSubscription } = createSubscriptionService();
    tx.subscription.findUnique.mockResolvedValue({
      ...existingSubscription,
      status: 'CANCELED',
    });

    await expect(service.changePlan('sub-1', 'plan-2')).rejects.toMatchObject(
      new BizError(ApiCode.ILLEGAL_TRANSITION, '订阅状态不允许换套餐'),
    );
    expect(tx.subscription.update).not.toHaveBeenCalled();
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it('rejects changePlan for an EXPIRED subscription', async () => {
    const { service, tx, existingSubscription } = createSubscriptionService();
    tx.subscription.findUnique.mockResolvedValue({
      ...existingSubscription,
      status: 'EXPIRED',
    });

    await expect(service.changePlan('sub-1', 'plan-2')).rejects.toMatchObject(
      new BizError(ApiCode.ILLEGAL_TRANSITION, '订阅状态不允许换套餐'),
    );
  });

  it('upgrades mid-period and bills the prorated difference (补差) in integer cents', async () => {
    const { service, tx } = createSubscriptionService();
    // 新套餐 19900 (升档)，旧 9900；30 天账期，06-16 换 -> 剩余 15 天
    tx.billingPlan.findFirst.mockResolvedValue({
      id: 'plan-2',
      monthlyPrice: BigInt(19900),
      quotas: { sms: 200 },
      overagePrices: { sms: 8 },
    });

    await service.changePlan(
      'sub-1',
      'plan-2',
      undefined,
      new Date('2026-06-16T00:00:00.000Z'),
    );

    // 套餐快照已切换到新套餐，周期边界不变
    expect(tx.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: expect.objectContaining({
          planId: 'plan-2',
          planSnapshot: expect.objectContaining({ monthlyPrice: 19900 }),
        }),
      }),
    );
    const updateArg = tx.subscription.update.mock.calls[0][0];
    expect(updateArg.data).not.toHaveProperty('currentPeriodStart');
    expect(updateArg.data).not.toHaveProperty('currentPeriodEnd');

    // 调整账单：net = floor(19900*15/30) - floor(9900*15/30) = 9950 - 4950 = 5000
    expect(tx.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionId: 'sub-1',
          status: 'OPEN',
          periodStart: new Date('2026-06-16T00:00:00.000Z'),
          totalAmount: BigInt(5000),
          baseAmount: BigInt(0),
          overageAmount: BigInt(0),
        }),
      }),
    );
    const created = tx.invoice.create.mock.calls[0][0].data;
    expect(typeof created.totalAmount).toBe('bigint');
    expect(created.lineItems).toEqual([
      expect.objectContaining({ type: 'PRORATION_CREDIT', amount: -4950 }),
      expect.objectContaining({ type: 'PRORATION_DEBIT', amount: 9950 }),
    ]);
  });

  it('downgrades mid-period into a CREDIT invoice that never enters payment collection', async () => {
    const { service, tx } = createSubscriptionService();
    // 旧 9900 -> 新 4900 (降档)
    tx.billingPlan.findFirst.mockResolvedValue({
      id: 'plan-0',
      monthlyPrice: BigInt(4900),
      quotas: { sms: 50 },
      overagePrices: { sms: 12 },
    });

    await service.changePlan(
      'sub-1',
      'plan-0',
      undefined,
      new Date('2026-06-16T00:00:00.000Z'),
    );

    // net = floor(4900*15/30) - floor(9900*15/30) = 2450 - 4950 = -2500 (抵扣)
    expect(tx.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'CREDIT',
          totalAmount: BigInt(-2500),
        }),
      }),
    );
  });

  it('skips the adjustment invoice for a same-price plan change', async () => {
    const { service, tx } = createSubscriptionService();
    // 同价换套餐 (9900 -> 9900) -> net 0，不出调整账单
    tx.billingPlan.findFirst.mockResolvedValue({
      id: 'plan-3',
      monthlyPrice: BigInt(9900),
      quotas: { sms: 100 },
      overagePrices: { sms: 10 },
    });

    await service.changePlan(
      'sub-1',
      'plan-3',
      undefined,
      new Date('2026-06-16T00:00:00.000Z'),
    );

    expect(tx.subscription.update).toHaveBeenCalled();
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it('is idempotent — a repeated change at the same instant does not double-bill', async () => {
    const { service, tx } = createSubscriptionService();
    tx.billingPlan.findFirst.mockResolvedValue({
      id: 'plan-2',
      monthlyPrice: BigInt(19900),
      quotas: {},
      overagePrices: {},
    });
    // 已存在同一时点的调整账单 -> 命中去重，跳过 create
    tx.invoice.findUnique.mockResolvedValue({ id: 'adj-existing' });

    await service.changePlan(
      'sub-1',
      'plan-2',
      undefined,
      new Date('2026-06-16T00:00:00.000Z'),
    );

    expect(tx.invoice.findUnique).toHaveBeenCalledWith({
      where: {
        subscriptionId_periodStart: {
          subscriptionId: 'sub-1',
          periodStart: new Date('2026-06-16T00:00:00.000Z'),
        },
      },
    });
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });
});
