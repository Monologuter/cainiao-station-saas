import { http } from './http';
import { toShippingQueryParams } from './shipping';

export interface BillingPlan {
  id: string;
  code: string;
  name: string;
  monthlyPrice: number;
  quotas: Record<string, number>;
  overagePrices: Record<string, number>;
  status: string;
}

export interface Subscription {
  id: string;
  tenantId: string;
  stationId?: string;
  planId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextBillingAt: string;
  planSnapshot: {
    monthlyPrice: number;
    quotas?: Record<string, number>;
    overagePrices?: Record<string, number>;
  };
}

export interface Invoice {
  id: string;
  code: string;
  status: string;
  baseAmount: number;
  overageAmount: number;
  totalAmount: number;
  periodStart: string;
  periodEnd: string;
  dueAt: string;
  paidAt?: string | null;
}

export interface UsageRecord {
  id: string;
  metric: string;
  quantity: number;
  periodStart: string;
  subscriptionId: string;
}

export function makeInvoicePayKey(invoiceId: string) {
  return `invoice-pay-${invoiceId}-${Date.now()}`;
}

export function billingStatusMeta(status: string) {
  const metas: Record<string, { label: string; tag: string }> = {
    ACTIVE: { label: '生效中', tag: 'green' },
    PAST_DUE: { label: '已逾期', tag: 'amber' },
    SUSPENDED: { label: '已停用', tag: 'red' },
    OPEN: { label: '待支付', tag: 'blue' },
    OVERDUE: { label: '逾期', tag: 'red' },
    PAID: { label: '已支付', tag: 'green' },
    VOID: { label: '已作废', tag: 'gray' },
  };
  return metas[status] ?? { label: status, tag: 'gray' };
}

export function billingPlansApi() {
  return http.get<never, BillingPlan[]>('/billing/plans');
}

export function subscriptionsApi(query: Record<string, unknown> = {}) {
  return http.get<never, Subscription[]>('/billing/subscriptions', {
    params: toShippingQueryParams(query),
  });
}

export function invoicesApi(query: Record<string, unknown> = {}) {
  return http.get<never, Invoice[]>('/billing/invoices', {
    params: toShippingQueryParams(query),
  });
}

export function usageApi(query: Record<string, unknown> = {}) {
  return http.get<never, UsageRecord[]>('/billing/usage', {
    params: toShippingQueryParams(query),
  });
}

export function payInvoiceApi(
  invoiceId: string,
  idempotencyKey = makeInvoicePayKey(invoiceId),
) {
  return http.post<never, Invoice>(`/billing/invoices/${invoiceId}/pay`, undefined, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}
