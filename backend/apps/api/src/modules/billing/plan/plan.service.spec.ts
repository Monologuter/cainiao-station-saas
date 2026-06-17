import { ApiCode, BizError } from '../../../core/http/api-code';
import { PlanService } from './plan.service';

function createPlanService() {
  const tx = {
    $executeRawUnsafe: jest.fn(),
    billingPlan: {
      create: jest.fn().mockResolvedValue({ id: 'p1', code: 'PRO' }),
      update: jest.fn().mockResolvedValue({ id: 'p1', status: 'ARCHIVED' }),
      findMany: jest
        .fn()
        .mockResolvedValue([{ code: 'BASIC', status: 'ACTIVE' }]),
    },
  };
  const prisma = {
    $transaction: (fn: any) => fn(tx),
    billingPlan: tx.billingPlan,
  } as any;
  return { service: new PlanService(prisma), tx };
}

describe('PlanService', () => {
  it('creates platform billing plans with normalized money and quota payload', async () => {
    const { service, tx } = createPlanService();

    await service.createPlan({
      code: 'pro',
      name: '专业版',
      monthlyPrice: 29900,
      quotas: { sms: 1000, parcels: -1, stations: 3 },
      overagePrices: { sms: 8, parcels: 0, stations: 15900 },
    });

    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      `SELECT set_config('app.bypass_rls', 'on', true)`,
    );
    expect(tx.billingPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'PRO',
          monthlyPrice: 29900,
          status: 'ACTIVE',
        }),
      }),
    );
  });

  it('lists only active plans for tenant selection', async () => {
    const { service, tx } = createPlanService();

    await expect(service.listActivePlans()).resolves.toEqual([
      { code: 'BASIC', status: 'ACTIVE' },
    ]);
    expect(tx.billingPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
    );
  });

  it('archives a plan instead of deleting it', async () => {
    const { service, tx } = createPlanService();

    await service.archivePlan('p1');

    expect(tx.billingPlan.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'ARCHIVED' },
    });
  });

  it('rejects tenant users writing platform plans', async () => {
    const { service } = createPlanService();

    await expect(
      service.assertPlatform({ isPlatform: false }),
    ).rejects.toMatchObject(
      new BizError(ApiCode.FORBIDDEN, '无权限执行该操作'),
    );
  });
});
