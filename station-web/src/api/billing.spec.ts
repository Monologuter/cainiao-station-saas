import { describe, expect, it, vi } from 'vitest';
import { http } from './http';
import {
  billingPlansApi,
  billingStatusMeta,
  invoicesApi,
  makeInvoicePayKey,
  payInvoiceApi,
  subscriptionsApi,
  usageApi,
} from './billing';

describe('station billing api', () => {
  it('maps plans, subscriptions, invoices and usage endpoints', async () => {
    const get = vi.spyOn(http, 'get').mockResolvedValue([]);

    await billingPlansApi();
    await subscriptionsApi({ status: 'ACTIVE', stationId: '' });
    await invoicesApi({ status: 'OPEN' });
    await usageApi({ subscriptionId: 'sub-1' });

    expect(get).toHaveBeenCalledWith('/billing/plans');
    expect(get).toHaveBeenCalledWith('/billing/subscriptions', {
      params: { status: 'ACTIVE' },
    });
    expect(get).toHaveBeenCalledWith('/billing/invoices', {
      params: { status: 'OPEN' },
    });
    expect(get).toHaveBeenCalledWith('/billing/usage', {
      params: { subscriptionId: 'sub-1' },
    });
  });

  it('pays invoice with an idempotency key', async () => {
    const post = vi.spyOn(http, 'post').mockResolvedValue({});

    await payInvoiceApi('inv-1', 'pay-key');

    expect(post).toHaveBeenCalledWith('/billing/invoices/inv-1/pay', undefined, {
      headers: { 'Idempotency-Key': 'pay-key' },
    });
    expect(makeInvoicePayKey('inv-1')).toMatch(/^invoice-pay-inv-1-/);
  });

  it('maps billing status to stable tags', () => {
    expect(billingStatusMeta('ACTIVE')).toEqual({ label: '生效中', tag: 'green' });
    expect(billingStatusMeta('OPEN')).toEqual({ label: '待支付', tag: 'blue' });
    expect(billingStatusMeta('OVERDUE')).toEqual({ label: '逾期', tag: 'red' });
  });
});
