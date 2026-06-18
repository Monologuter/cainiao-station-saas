import { EventBus } from '../../core/event-bus/event-bus';
import { ApiCode } from '../../core/http/api-code';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { MockPayChannel } from './mock-pay.channel';
import { PayService } from './pay.service';

describe('PayService', () => {
  it('pays a CREATED shipping order and publishes ShipOrderPaid', async () => {
    const state: any = {
      order: {
        id: 'so1',
        tenantId: 't1',
        orderNo: 'SO1',
        status: 'CREATED',
        quoteAmount: 1300,
        version: 0,
      },
      payments: [] as any[],
    };
    const tx = makeTx(state);
    const prisma = { withTenant: jest.fn(async (fn) => fn(tx)) };
    const eventBus = { publish: jest.fn() };
    const service = new PayService(
      prisma as any,
      new MockPayChannel(),
      eventBus as any,
    );

    const result = await TenantContext.run(
      { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
      () => service.payShipOrder('so1', 'pay-key-1'),
    );

    expect(result.status).toBe('PAID');
    expect(state.payments).toHaveLength(1);
    expect(state.payments[0]).toMatchObject({
      tenantId: 't1',
      bizType: 'SHIP_ORDER',
      bizId: 'so1',
      amount: 1300,
      status: 'SUCCESS',
      idempotencyKey: 'pay-key-1',
    });
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ShipOrderPaid',
        payload: expect.objectContaining({
          tenantId: 't1',
          shipOrderId: 'so1',
          amount: 1300,
          paymentId: 'pay1',
        }),
      }),
    );
  });

  it('returns the paid order for repeated successful idempotency key', async () => {
    const state: any = {
      order: { id: 'so1', tenantId: 't1', status: 'PAID', quoteAmount: 1300 },
      payments: [{ id: 'pay1', idempotencyKey: 'same-key', status: 'SUCCESS' }],
    };
    const tx = makeTx(state);
    const prisma = { withTenant: jest.fn(async (fn) => fn(tx)) };
    const channel = { pay: jest.fn() };
    const service = new PayService(prisma as any, channel as any, {} as any);

    const result = await TenantContext.run(
      { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
      () => service.payShipOrder('so1', 'same-key'),
    );

    expect(result.status).toBe('PAID');
    expect(channel.pay).not.toHaveBeenCalled();
  });

  it('keeps WeChat prepay pending and confirms a signed callback once', async () => {
    const state: any = {
      order: {
        id: 'so1',
        tenantId: 't1',
        orderNo: 'SO1',
        status: 'CREATED',
        quoteAmount: 1300,
        version: 0,
      },
      payments: [] as any[],
    };
    const tx = makeTx(state);
    const prisma = { withTenant: jest.fn(async (fn) => fn(tx)) };
    const channel = {
      code: 'wechat',
      pay: jest.fn(async () => ({
        status: 'PENDING',
        outTradeNo: 'pay-key-1',
        raw: { provider: 'wechat', prepayId: 'prepay-1' },
      })),
      verifyCallback: jest.fn(() => ({
        status: 'SUCCESS',
        outTradeNo: 'pay-key-1',
        paidAt: new Date('2026-06-18T10:00:00.000Z'),
        raw: { provider: 'wechat', transactionId: 'wx-tx-1' },
      })),
    };
    const eventBus = { publish: jest.fn() };
    const service = new PayService(
      prisma as any,
      channel as any,
      eventBus as any,
    );

    const prepay = await TenantContext.run(
      { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
      () => service.payShipOrder('so1', 'pay-key-1'),
    );

    expect(prepay.status).toBe('CREATED');
    expect(state.payments[0]).toMatchObject({
      status: 'PENDING',
      outTradeNo: 'pay-key-1',
    });
    expect(eventBus.publish).not.toHaveBeenCalled();

    await expect(
      service.confirmShipOrderPaymentCallback('t1', 'pay-key-1', {
        payload: '{}',
      }),
    ).resolves.toMatchObject({ status: 'PAID' });

    await expect(
      service.confirmShipOrderPaymentCallback('t1', 'pay-key-1', {
        payload: '{}',
      }),
    ).resolves.toMatchObject({ status: 'PAID' });

    expect(channel.verifyCallback).toHaveBeenCalledWith({
      payload: '{}',
      expectedAmount: 1300,
    });
    expect(state.payments[0]).toMatchObject({
      status: 'SUCCESS',
      paidAt: new Date('2026-06-18T10:00:00.000Z'),
      rawJson: { provider: 'wechat', transactionId: 'wx-tx-1' },
    });
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('raises a conflict when a concurrent writer moves the order before PAID guard', async () => {
    const state: any = {
      order: {
        id: 'so1',
        tenantId: 't1',
        orderNo: 'SO1',
        status: 'CREATED',
        quoteAmount: 1300,
        version: 0,
      },
      payments: [] as any[],
    };
    const tx = makeTx(state);
    // 模拟并发推进：本事务 updateMany 前订单已被改成 CANCELLED，
    // 守护 WHERE(status:CREATED) 不命中 → count 0 → 抛冲突，不会脏置为 PAID。
    tx.shipOrder.updateMany.mockImplementationOnce(async () => {
      state.order.status = 'CANCELLED';
      return { count: 0 };
    });
    const eventBus = { publish: jest.fn() };
    const service = new PayService(
      { withTenant: jest.fn(async (fn) => fn(tx)) } as any,
      new MockPayChannel(),
      eventBus as any,
    );

    await expect(
      TenantContext.run(
        { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
        () => service.payShipOrder('so1', 'pay-key-race'),
      ),
    ).rejects.toMatchObject({ code: ApiCode.IDEMPOTENCY_CONFLICT });
    expect(state.order.status).toBe('CANCELLED');
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('confirms a payment callback only once under concurrent callbacks (idempotent second)', async () => {
    const state: any = {
      order: {
        id: 'so1',
        tenantId: 't1',
        orderNo: 'SO1',
        status: 'CREATED',
        quoteAmount: 1300,
        version: 0,
      },
      payments: [
        {
          id: 'pay1',
          tenantId: 't1',
          bizType: 'SHIP_ORDER',
          bizId: 'so1',
          outTradeNo: 'pay-key-1',
          amount: 1300,
          status: 'PENDING',
        },
      ],
    };
    const tx = makeTx(state);
    const channel = {
      code: 'wechat',
      verifyCallback: jest.fn(() => ({
        status: 'SUCCESS',
        outTradeNo: 'pay-key-1',
        paidAt: new Date('2026-06-18T10:00:00.000Z'),
        raw: { provider: 'wechat', transactionId: 'wx-tx-1' },
      })),
    };
    const eventBus = { publish: jest.fn() };
    const service = new PayService(
      { withTenant: jest.fn(async (fn) => fn(tx)) } as any,
      channel as any,
      eventBus as any,
    );

    const first = await service.confirmShipOrderPaymentCallback(
      't1',
      'pay-key-1',
      { payload: '{}' },
    );
    const second = await service.confirmShipOrderPaymentCallback(
      't1',
      'pay-key-1',
      { payload: '{}' },
    );

    expect(first.status).toBe('PAID');
    expect(second.status).toBe('PAID');
    // 仅首个回调推进订单状态一次；第二次因 payment 已 SUCCESS 提前返回。
    expect(tx.shipOrder.updateMany).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('rejects non-CREATED orders', async () => {
    const state: any = {
      order: { id: 'so1', tenantId: 't1', status: 'PAID', quoteAmount: 1300 },
      payments: [],
    };
    const service = new PayService(
      { withTenant: jest.fn(async (fn) => fn(makeTx(state))) } as any,
      new MockPayChannel(),
      {} as any,
    );

    await expect(
      TenantContext.run(
        { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
        () => service.payShipOrder('so1', 'pay-key-2'),
      ),
    ).rejects.toMatchObject({
      code: ApiCode.SHIPPING_ILLEGAL_TRANSITION,
    });
  });

  it('refunds a paid uncollected shipping order outside the DB transaction and cancels it', async () => {
    const state: any = {
      order: {
        id: 'so1',
        tenantId: 't1',
        orderNo: 'SO1',
        status: 'PAID',
        quoteAmount: 800,
        collectedAt: null,
      },
      payments: [
        {
          id: 'pay1',
          tenantId: 't1',
          bizType: 'SHIP_ORDER',
          bizId: 'so1',
          amount: 800,
          status: 'SUCCESS',
          outTradeNo: 'out-1',
          rawJson: {},
        },
      ],
    };
    // 记录调用顺序，证明外部退款发生在 DB 事务「之间」（先读事务关闭、后写事务开启）。
    const calls: string[] = [];
    let txOpen = false;
    const withTenant = jest.fn(async (fn: any) => {
      txOpen = true;
      calls.push('tx:open');
      try {
        return await fn(makeTx(state));
      } finally {
        txOpen = false;
        calls.push('tx:close');
      }
    });
    const channel = {
      code: 'mock',
      refund: jest.fn(async () => {
        // 关键断言：调用外部退款时不应有 DB 事务处于打开状态。
        expect(txOpen).toBe(false);
        calls.push('channel.refund');
        return {
          status: 'SUCCESS',
          refundNo: 'refund:refund-key-1',
          raw: { refundId: 'r1' },
        };
      }),
    };
    const service = new PayService(
      { withTenant } as any,
      channel as any,
      {} as any,
    );

    await expect(
      TenantContext.run(
        { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
        () => service.refundShipOrder('so1', 'refund-key-1'),
      ),
    ).resolves.toMatchObject({ status: 'CANCELLED' });

    // refundNo 仍由 idempotencyKey 派生，渠道侧幂等键不变。
    expect(channel.refund).toHaveBeenCalledWith(
      expect.objectContaining({
        outTradeNo: 'out-1',
        amount: 800,
        refundAmount: 800,
        refundNo: 'refund:refund-key-1',
      }),
    );
    expect(state.payments[0].status).toBe('REFUNDED');
    // 顺序：读事务开/关 → 事务外退款 → 写事务开/关。
    expect(calls).toEqual([
      'tx:open',
      'tx:close',
      'channel.refund',
      'tx:open',
      'tx:close',
    ]);
  });

  it('is idempotent: a second refund on an already cancelled order does not call the channel again', async () => {
    const state: any = {
      order: {
        id: 'so1',
        tenantId: 't1',
        orderNo: 'SO1',
        status: 'CANCELLED',
        quoteAmount: 800,
        collectedAt: null,
        cancelledAt: new Date(),
      },
      payments: [
        {
          id: 'pay1',
          tenantId: 't1',
          bizType: 'SHIP_ORDER',
          bizId: 'so1',
          amount: 800,
          status: 'REFUNDED',
          outTradeNo: 'out-1',
          rawJson: {},
        },
      ],
    };
    const channel = { code: 'mock', refund: jest.fn() };
    const service = new PayService(
      { withTenant: jest.fn(async (fn) => fn(makeTx(state))) } as any,
      channel as any,
      {} as any,
    );

    await expect(
      TenantContext.run(
        { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
        () => service.refundShipOrder('so1', 'refund-key-1'),
      ),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
    // 已取消订单：短路返回，绝不重复发起外部退款。
    expect(channel.refund).not.toHaveBeenCalled();
  });
});

function makeTx(state: any) {
  return {
    payment: {
      findUnique: jest.fn(async ({ where }) =>
        state.payments.find(
          (payment: any) =>
            payment.idempotencyKey ===
            where.tenantId_idempotencyKey.idempotencyKey,
        ),
      ),
      create: jest.fn(async ({ data }) => {
        const payment = { id: 'pay1', ...data };
        state.payments.push(payment);
        return payment;
      }),
      findFirst: jest.fn(async ({ where }) =>
        state.payments.find((payment: any) => {
          if (where.tenantId && payment.tenantId !== where.tenantId)
            return false;
          if (where.outTradeNo && payment.outTradeNo !== where.outTradeNo) {
            return false;
          }
          if (where.bizType && payment.bizType !== where.bizType) return false;
          if (where.bizId && payment.bizId !== where.bizId) return false;
          if (where.status && payment.status !== where.status) return false;
          return payment.deletedAt == null;
        }),
      ),
      update: jest.fn(async ({ where, data }) => {
        const index = state.payments.findIndex(
          (payment: any) => payment.id === where.id,
        );
        state.payments[index] = { ...state.payments[index], ...data };
        return state.payments[index];
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        // 模拟 status 守护：仅当 WHERE.status 匹配当前态时落库一次。
        const index = state.payments.findIndex(
          (payment: any) => payment.id === where.id,
        );
        if (index < 0) return { count: 0 };
        if (
          where.status !== undefined &&
          state.payments[index].status !== where.status
        ) {
          return { count: 0 };
        }
        state.payments[index] = { ...state.payments[index], ...data };
        return { count: 1 };
      }),
    },
    shipOrder: {
      findFirst: jest.fn(async ({ where }) => {
        if (where.id !== state.order.id) return null;
        if (where.tenantId && where.tenantId !== state.order.tenantId) {
          return null;
        }
        return state.order;
      }),
      update: jest.fn(async ({ data }) => {
        state.order = {
          ...state.order,
          ...data,
          version: (state.order.version ?? 0) + 1,
        };
        return state.order;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        // 模拟乐观锁：仅当 WHERE 的 status 匹配当前态时生效一次。
        if (where.id && where.id !== state.order.id) return { count: 0 };
        if (where.status !== undefined && where.status !== state.order.status) {
          return { count: 0 };
        }
        const { version, ...rest } = data;
        state.order = {
          ...state.order,
          ...rest,
          version:
            (state.order.version ?? 0) +
            (version?.increment ? version.increment : 0),
        };
        return { count: 1 };
      }),
    },
  };
}
