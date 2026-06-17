import { http } from "./http";
import { toAdminAnalyticsQueryParams } from "./analytics";

export interface BillingPlan {
  id: string;
  code: string;
  name: string;
  monthlyPrice: number;
  quotas: Record<string, number>;
  overagePrices: Record<string, number>;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT";
  description?: string;
  sort?: number;
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
  tenantId: string;
  subscriptionId: string;
  code: string;
  status: string;
  baseAmount: number;
  overageAmount: number;
  totalAmount: number;
  periodStart: string;
  periodEnd: string;
  dueAt: string;
  paidAt?: string | null;
  lineItems: Array<Record<string, unknown>>;
}

export interface UsageRecord {
  id: string;
  tenantId: string;
  subscriptionId: string;
  metric: string;
  quantity: number;
  periodStart: string;
}

export interface PlanInput {
  code: string;
  name: string;
  monthlyPrice: number;
  quotas: Record<string, number>;
  overagePrices: Record<string, number>;
  description?: string;
  sort?: number;
}

export function billingPlansApi() {
  return http.get<never, BillingPlan[]>("/billing/plans");
}

export function createBillingPlanApi(input: PlanInput) {
  return http.post<never, BillingPlan>("/billing/plans", input);
}

export function updateBillingPlanApi(id: string, input: Partial<PlanInput>) {
  return http.put<never, BillingPlan>(`/billing/plans/${id}`, input);
}

export function archiveBillingPlanApi(id: string) {
  return http.post<never, BillingPlan>(`/billing/plans/${id}/archive`);
}

export function billingSubscriptionsApi(query: Record<string, unknown> = {}) {
  return http.get<never, Subscription[]>("/billing/subscriptions", {
    params: toAdminAnalyticsQueryParams(query),
  });
}

export function billingInvoicesApi(query: Record<string, unknown> = {}) {
  return http.get<never, Invoice[]>("/billing/invoices", {
    params: toAdminAnalyticsQueryParams(query),
  });
}

export function billingUsageApi(query: Record<string, unknown> = {}) {
  return http.get<never, UsageRecord[]>("/billing/usage", {
    params: toAdminAnalyticsQueryParams(query),
  });
}

export function runBillingInvoiceApi(input: {
  tenantId?: string;
  subscriptionId: string;
  periodStart?: string;
}) {
  return http.post<never, Invoice>("/billing/invoices/run", input);
}
