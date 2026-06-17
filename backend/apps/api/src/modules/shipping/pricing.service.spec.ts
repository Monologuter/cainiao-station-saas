import { ApiCode } from '../../core/http/api-code';
import { PricingService } from './pricing.service';

describe('PricingService', () => {
  const makeService = (rule: any) => {
    const tx = {
      priceRule: {
        findFirst: jest.fn().mockResolvedValue(rule),
      },
    };
    const prisma = { withTenant: jest.fn(async (fn) => fn(tx)) };
    return { service: new PricingService(prisma as any), tx };
  };

  it('charges only first weight price inside the first weight', async () => {
    const { service } = makeService({
      firstWeightGram: 1000,
      firstPrice: 1200,
      addUnitGram: 1000,
      addPrice: 400,
      zoneFactor: 1.2,
      courierCode: 'YTO',
      courierName: '圆通速递',
      zone: 'CROSS_PROVINCE',
      estHours: 48,
    });

    await expect(
      service.quote('YTO', 'CROSS_PROVINCE', 800),
    ).resolves.toMatchObject({
      courierCode: 'YTO',
      courierName: '圆通速递',
      amount: 1440,
      breakdown: {
        firstPrice: 1200,
        addWeightUnits: 0,
        addPrice: 0,
        subtotal: 1200,
        zoneFactor: 1.2,
        total: 1440,
      },
    });
  });

  it('rounds up additional weight to the next billing unit', async () => {
    const { service } = makeService({
      firstWeightGram: 1000,
      firstPrice: 1000,
      addUnitGram: 500,
      addPrice: 300,
      zoneFactor: 1,
      courierCode: 'ZTO',
      courierName: '中通快递',
      zone: 'SAME_PROVINCE',
      estHours: 36,
    });

    const quote = await service.quote('ZTO', 'SAME_PROVINCE', 1501);

    expect(quote.amount).toBe(1600);
    expect(quote.breakdown).toMatchObject({
      addWeightUnits: 2,
      addPrice: 600,
      subtotal: 1600,
      total: 1600,
    });
  });

  it('selects the highest priority enabled rule for a courier and zone', async () => {
    const { service, tx } = makeService({
      firstWeightGram: 1000,
      firstPrice: 900,
      addUnitGram: 1000,
      addPrice: 300,
      zoneFactor: 1,
      courierCode: 'SF',
      courierName: '顺丰速运',
      zone: 'SAME_CITY',
      estHours: 12,
    });

    await service.quote('SF', 'SAME_CITY', 1000);

    expect(tx.priceRule.findFirst).toHaveBeenCalledWith({
      where: { courierCode: 'SF', zone: 'SAME_CITY', enabled: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
  });

  it('throws a business error when no price rule matches', async () => {
    const { service } = makeService(null);

    await expect(service.quote('JD', 'REMOTE', 1000)).rejects.toMatchObject({
      code: ApiCode.SHIPPING_NO_PRICE_RULE,
    });
  });
});
