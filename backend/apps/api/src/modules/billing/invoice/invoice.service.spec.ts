import { EventBus } from '../../../core/event-bus/event-bus';
import { ApiCode, BizError } from '../../../core/http/api-code';
import { InvoiceService } from './invoice.service';

function createInvoiceService() {
  const subscription = {
    id: 'sub-1',
    tenantId: 'tenant-1',
    stationId: 'station-1',
    currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
    planSnapshot: {
      monthlyPrice: 1000,
      quotas: { sms: 1 },
      overagePrices: { sms: 5 },
    },
  };
  const usageRecords = [
    { metric: 'SMS', quantity: BigInt(3) },
    { metric: 'PARCELS', quantity: BigInt(9) },
  ];
  const invoice = {
    id: 'invoice-1',
    tenantId: 'tenant-1',
    subscriptionId: 'sub-1',
    code: 'INV-202606-sub-1',
    periodStart: subscription.currentPeriodStart,
    periodEnd: subscription.currentPeriodEnd,
    status: 'OPEN',
    baseAmount: BigInt(1000),
    overageAmount: BigInt(10),
    totalAmount: BigInt(1010),
    lineItems: [],
  };
  const tx = {
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    subscription: {
      findFirst: jest.fn().mockResolvedValue(subscription),
      update: jest.fn().mockResolvedValue({
        ...subscription,
        currentPeriodStart: subscription.currentPeriodEnd,
        currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
      }),
    },
    usageRecord: {
      findMany: jest.fn().mockResolvedValue(usageRecords),
    },
    invoice: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(invoice),
      create: jest.fn().mockResolvedValue(invoice),
      update: jest.fn().mockResolvedValue({ ...invoice, status: 'VOID' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([invoice]),
    },
  };
  const tenantPrisma = { withTenant: (fn: any) => fn(tx) } as any;
  const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;
  return { service: new InvoiceService(tenantPrisma, eventBus), tx, eventBus };
}

describe('InvoiceService', () => {
  it('generates an invoice from plan snapshot and period usage', async () => {
    const { service, tx, eventBus } = createInvoiceService();

    const result = await service.generateInvoice({
      tenantId: 'tenant-1',
      subscriptionId: 'sub-1',
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(tx.usageRecord.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        subscriptionId: 'sub-1',
        periodStart: new Date('2026-06-01T00:00:00.000Z'),
        deletedAt: null,
      },
    });
    expect(tx.$queryRawUnsafe).toHaveBeenCalledWith(
      'SELECT id FROM "subscriptions" WHERE id = $1 FOR UPDATE',
      'sub-1',
    );
    expect(tx.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          subscriptionId: 'sub-1',
          status: 'OPEN',
          baseAmount: BigInt(1000),
          overageAmount: BigInt(10),
          totalAmount: BigInt(1010),
          lineItems: expect.arrayContaining([
            { type: 'BASE', amount: 1000 },
            expect.objectContaining({
              type: 'OVERAGE',
              metric: 'SMS',
              overage: 2,
              amount: 10,
            }),
          ]),
        }),
      }),
    );
    expect(tx.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sub-1' },
        data: expect.objectContaining({
          currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
          currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
          nextBillingAt: new Date('2026-08-01T00:00:00.000Z'),
        }),
      }),
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'InvoiceGenerated',
        payload: expect.objectContaining({ invoiceId: 'invoice-1' }),
      }),
    );
    expect(result).toMatchObject({ id: 'invoice-1', totalAmount: 1010 });
  });

  it('returns the existing invoice for the same subscription period', async () => {
    const { service, tx, eventBus } = createInvoiceService();
    tx.invoice.findUnique.mockResolvedValue({
      id: 'invoice-existing',
      tenantId: 'tenant-1',
      subscriptionId: 'sub-1',
      status: 'OPEN',
      baseAmount: BigInt(1000),
      overageAmount: BigInt(0),
      totalAmount: BigInt(1000),
      lineItems: [],
    });

    const result = await service.generateInvoice({
      tenantId: 'tenant-1',
      subscriptionId: 'sub-1',
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
    });

    expect(tx.invoice.create).not.toHaveBeenCalled();
    expect(tx.subscription.update).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'invoice-existing', totalAmount: 1000 });
  });

  it('bills the next period at full base amount without re-prorating after a plan change', async () => {
    const { service, tx } = createInvoiceService();
    // 模拟换套餐后：planSnapshot 已是新套餐全额 base，周期边界为新一期。
    // 调整账单以 changeAt 为 periodStart 存在，但常规出账以 currentPeriodStart 去重，
    // 二者 key 不同 -> 互不命中，常规账单按新套餐全额出账且不含 proration 行。
    tx.subscription.findFirst.mockResolvedValue({
      id: 'sub-1',
      tenantId: 'tenant-1',
      stationId: 'station-1',
      currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
      planSnapshot: { monthlyPrice: 19900, quotas: { sms: 1 }, overagePrices: { sms: 5 } },
    });
    tx.usageRecord.findMany.mockResolvedValue([]);

    await service.generateInvoice({
      tenantId: 'tenant-1',
      subscriptionId: 'sub-1',
      now: new Date('2026-08-01T00:00:00.000Z'),
    });

    // 去重查询按 currentPeriodStart（新一期），不会命中 changeAt 调整账单
    expect(tx.invoice.findUnique).toHaveBeenCalledWith({
      where: {
        subscriptionId_periodStart: {
          subscriptionId: 'sub-1',
          periodStart: new Date('2026-07-01T00:00:00.000Z'),
        },
      },
    });
    const createArg = tx.invoice.create.mock.calls[0][0].data;
    expect(createArg.baseAmount).toBe(BigInt(19900));
    expect(createArg.totalAmount).toBe(BigInt(19900));
    // 常规账单不含任何 proration 行
    expect(
      (createArg.lineItems as any[]).some((li) =>
        String(li.type).startsWith('PRORATION'),
      ),
    ).toBe(false);
  });

  it('bills the changed period at the original base amount so upgrade proration is not double charged', async () => {
    const { service, tx } = createInvoiceService();
    tx.subscription.findFirst.mockResolvedValue({
      id: 'sub-1',
      tenantId: 'tenant-1',
      stationId: 'station-1',
      currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      planSnapshot: {
        monthlyPrice: 19900,
        quotas: { sms: 1 },
        overagePrices: { sms: 5 },
      },
    });
    tx.usageRecord.findMany.mockResolvedValue([]);
    tx.invoice.findMany.mockResolvedValue([
      {
        id: 'adj-1',
        status: 'PAID',
        totalAmount: BigInt(5000),
        periodStart: new Date('2026-06-16T00:00:00.000Z'),
        lineItems: [
          {
            type: 'PRORATION_CREDIT',
            amount: -4950,
            planMonthlyPrice: 9900,
          },
          {
            type: 'PRORATION_DEBIT',
            amount: 9950,
            planMonthlyPrice: 19900,
          },
        ],
      },
    ]);

    await service.generateInvoice({
      tenantId: 'tenant-1',
      subscriptionId: 'sub-1',
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    const createArg = tx.invoice.create.mock.calls[0][0].data;
    expect(createArg.baseAmount).toBe(BigInt(9900));
    expect(createArg.totalAmount).toBe(BigInt(9900));
    expect(createArg.lineItems).toEqual(
      expect.arrayContaining([{ type: 'BASE', amount: 9900 }]),
    );
  });

  it('automatically applies downgrade credits to the next positive invoice', async () => {
    const { service, tx } = createInvoiceService();
    tx.usageRecord.findMany.mockResolvedValue([]);
    tx.invoice.findMany.mockResolvedValue([
      {
        id: 'credit-1',
        status: 'CREDIT',
        totalAmount: BigInt(-250),
        lineItems: [],
      },
    ]);

    await service.generateInvoice({
      tenantId: 'tenant-1',
      subscriptionId: 'sub-1',
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    const createArg = tx.invoice.create.mock.calls[0][0].data;
    expect(createArg.baseAmount).toBe(BigInt(1000));
    expect(createArg.totalAmount).toBe(BigInt(750));
    expect(createArg.lineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'CREDIT_APPLIED',
          amount: -250,
          sourceInvoiceId: 'credit-1',
        }),
      ]),
    );
    expect(tx.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: 'credit-1', status: 'CREDIT', totalAmount: BigInt(-250) },
      data: { status: 'PAID', totalAmount: BigInt(0) },
    });
  });

  it('voids only open or overdue invoices', async () => {
    const { service, tx } = createInvoiceService();
    await service.voidInvoice('invoice-1');
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: 'invoice-1' },
      data: { status: 'VOID' },
    });

    tx.invoice.findFirst.mockResolvedValue({ status: 'PAID' });
    await expect(service.voidInvoice('invoice-1')).rejects.toMatchObject(
      new BizError(ApiCode.ILLEGAL_TRANSITION, '账单状态不允许作废'),
    );
  });
});
