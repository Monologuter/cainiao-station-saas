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
        state.payments.find(
          (payment: any) =>
            payment.tenantId === where.tenantId &&
            payment.outTradeNo === where.outTradeNo &&
            payment.bizType === where.bizType &&
            payment.deletedAt == null,
        ),
      ),
      update: jest.fn(async ({ where, data }) => {
        const index = state.payments.findIndex(
          (payment: any) => payment.id === where.id,
        );
        state.payments[index] = { ...state.payments[index], ...data };
        return state.payments[index];
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
    },
  };
}
