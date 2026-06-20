import { EventBus } from '../../../core/event-bus/event-bus';
import { ApiCode } from '../../../core/http/api-code';
import { TenantContext } from '../../../core/tenant-context/tenant-context';
import { MockPayChannel } from '../../pay/mock-pay.channel';
import { ExpiryCheckProcessor } from '../jobs/expiry-check.processor';
import { SubscriptionPayService } from './subscription-pay.service';

function createService(invoicePatch: Partial<any> = {}) {
  const state = {
    invoice: {
      id: 'inv-1',
      tenantId: 'tenant-1',
      subscriptionId: 'sub-1',
      status: 'OPEN',
      totalAmount: BigInt(1010),
      code: 'INV-1',
      ...invoicePatch,
    },
    payments: [] as any[],
  };
  const tx = {
    payment: {
      findUnique: jest.fn(async ({ where }) =>
        state.payments.find(
          (payment: any) =>
            payment.idempotencyKey ===
            where.tenantId_idempotencyKey.idempotencyKey,
        ),
      ),
      create: jest.fn(async ({ data }) => {
        const payment = { id: 'pay-1', ...data };
        state.payments.push(payment);
        return payment;
      }),
    },
    invoice: {
      findFirst: jest.fn(async () => state.invoice),
      update: jest.fn(async ({ data }) => {
        state.invoice = { ...state.invoice, ...data };
        return state.invoice;
      }),
    },
    subscription: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const tenantPrisma = { withTenant: jest.fn((fn) => fn(tx)) };
  const restore = { restoreTenantIfCleared: jest.fn() };
  const service = new SubscriptionPayService(
    tenantPrisma as any,
    new MockPayChannel(),
    { publish: jest.fn() } as unknown as jest.Mocked<EventBus>,
    restore as unknown as jest.Mocked<ExpiryCheckProcessor>,
  );
  return { service, state, tx, restore };
}

describe('SubscriptionPayService', () => {
  it('pays an open invoice and marks it paid', async () => {
    const { service, state, tx } = createService();

    const result = await TenantContext.run(
      {
        userId: 'u1',
        tenantId: 'tenant-1',
        roles: ['店长'],
        isPlatform: false,
      },
      () => service.payInvoice('inv-1', 'pay-key-1'),
    );

    expect(state.payments[0]).toMatchObject({
      tenantId: 'tenant-1',
      bizType: 'SUBSCRIPTION_INVOICE',
      bizId: 'inv-1',
      amount: 1010,
      status: 'SUCCESS',
      idempotencyKey: 'pay-key-1',
    });
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv-1' },
        data: expect.objectContaining({
          status: 'PAID',
          paymentId: 'pay-1',
        }),
      }),
    );
    expect(result).toMatchObject({ id: 'inv-1', status: 'PAID' });
  });

  it('returns the paid invoice for a repeated successful idempotency key', async () => {
    const { service, state } = createService({ status: 'PAID' });
    state.payments.push({
      id: 'pay-1',
      bizId: 'inv-1',
      idempotencyKey: 'same-key',
      status: 'SUCCESS',
    });

    const result = await TenantContext.run(
      {
        userId: 'u1',
        tenantId: 'tenant-1',
        roles: ['店长'],
        isPlatform: false,
      },
      () => service.payInvoice('inv-1', 'same-key'),
    );

    expect(result.status).toBe('PAID');
  });

  it('restores overdue subscriptions and tenant after payment', async () => {
    const { service, tx, restore } = createService({ status: 'OVERDUE' });

    await TenantContext.run(
      {
        userId: 'u1',
        tenantId: 'tenant-1',
        roles: ['店长'],
        isPlatform: false,
      },
      () => service.payInvoice('inv-1', 'pay-key-2'),
    );

    expect(tx.subscription.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub-1', status: { in: ['PAST_DUE', 'SUSPENDED'] } },
      data: { status: 'ACTIVE' },
    });
    expect(restore.restoreTenantIfCleared).toHaveBeenCalledWith('tenant-1');
  });

  it('rejects non-payable invoice status', async () => {
    const { service } = createService({ status: 'VOID' });

    await expect(
      TenantContext.run(
        {
          userId: 'u1',
          tenantId: 'tenant-1',
          roles: ['店长'],
          isPlatform: false,
        },
        () => service.payInvoice('inv-1', 'pay-key-3'),
      ),
    ).rejects.toMatchObject({ code: ApiCode.ILLEGAL_TRANSITION });
  });

  it('rejects zero and negative invoices before calling the payment channel', async () => {
    const { service, tx } = createService({ totalAmount: BigInt(0) });

    await expect(
      TenantContext.run(
        {
          userId: 'u1',
          tenantId: 'tenant-1',
          roles: ['店长'],
          isPlatform: false,
        },
        () => service.payInvoice('inv-1', 'pay-key-zero'),
      ),
    ).rejects.toMatchObject({ code: ApiCode.BAD_REQUEST });
    expect(tx.payment.create).not.toHaveBeenCalled();

    const negative = createService({ totalAmount: BigInt(-100) });
    await expect(
      TenantContext.run(
        {
          userId: 'u1',
          tenantId: 'tenant-1',
          roles: ['店长'],
          isPlatform: false,
        },
        () => negative.service.payInvoice('inv-1', 'pay-key-negative'),
      ),
    ).rejects.toMatchObject({ code: ApiCode.BAD_REQUEST });
    expect(negative.tx.payment.create).not.toHaveBeenCalled();
  });
});
