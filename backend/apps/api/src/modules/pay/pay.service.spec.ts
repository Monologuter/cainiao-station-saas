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
