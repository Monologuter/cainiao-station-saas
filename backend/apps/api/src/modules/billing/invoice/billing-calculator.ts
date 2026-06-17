import {
  PLAN_KEY_BY_METRIC,
  USAGE_METRICS,
  type UsageMetricCode,
} from '../usage/usage.metric';

export interface PlanSnapshot {
  monthlyPrice: number;
  quotas: Record<string, number>;
  overagePrices: Record<string, number>;
}

export interface InvoiceLineItem {
  type: 'BASE' | 'OVERAGE';
  amount: number;
  metric?: UsageMetricCode;
  quota?: number;
  used?: number;
  overage?: number;
  unitPrice?: number;
}

export interface InvoiceCalculation {
  baseAmount: number;
  overageAmount: number;
  totalAmount: number;
  lineItems: InvoiceLineItem[];
}

export type UsageByMetric = Partial<Record<UsageMetricCode, number>>;

export function calcInvoice(
  snapshot: PlanSnapshot,
  usage: UsageByMetric,
): InvoiceCalculation {
  const baseAmount = Number(snapshot.monthlyPrice ?? 0);
  const lineItems: InvoiceLineItem[] = [{ type: 'BASE', amount: baseAmount }];
  let overageAmount = 0;

  for (const metric of USAGE_METRICS) {
    const planKey = PLAN_KEY_BY_METRIC[metric];
    const quota = Number(snapshot.quotas?.[planKey] ?? 0);
    const unitPrice = Number(snapshot.overagePrices?.[planKey] ?? 0);
    const used = Number(usage[metric] ?? 0);

    if (quota === -1) {
      continue;
    }

    const overage = Math.max(0, used - Math.max(quota, 0));
    if (overage <= 0) {
      continue;
    }

    const amount = overage * unitPrice;
    overageAmount += amount;
    lineItems.push({
      type: 'OVERAGE',
      metric,
      quota,
      used,
      overage,
      unitPrice,
      amount,
    });
  }

  return {
    baseAmount,
    overageAmount,
    totalAmount: baseAmount + overageAmount,
    lineItems,
  };
}
