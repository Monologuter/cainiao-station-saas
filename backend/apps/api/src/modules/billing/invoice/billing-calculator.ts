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
  type:
    | 'BASE'
    | 'OVERAGE'
    | 'PRORATION_CREDIT'
    | 'PRORATION_DEBIT'
    | 'CREDIT_APPLIED';
  amount: number;
  metric?: UsageMetricCode;
  quota?: number;
  used?: number;
  overage?: number;
  unitPrice?: number;
  sourceInvoiceId?: string;
  // PRORATION_* 专用：剩余天数与基准周期天数，便于审计回溯
  remainingDays?: number;
  periodDays?: number;
  planMonthlyPrice?: number;
}

export interface ProrationResult {
  /** 总周期自然日天数（currentPeriodEnd - currentPeriodStart） */
  periodDays: number;
  /** 自换套餐时点起、计费到期的剩余自然日天数（不足一天按一天，Math.ceil） */
  remainingDays: number;
  /** 旧套餐未用天数的抵扣（整数分，>=0，作为贷记从净额中扣除） */
  creditAmount: number;
  /** 新套餐剩余天数的补收（整数分，>=0，作为借记计入净额） */
  debitAmount: number;
  /** 净调整额 = debit - credit（升档为正=补差；降档为负=抵扣） */
  netAmount: number;
  lineItems: InvoiceLineItem[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 月中换套餐 proration（按自然日比例 + 整数分）。
 *
 * 设计取舍：
 * - 按**自然日**比例分摊：剩余天数 = ceil((periodEnd - changeAt) / 1天)，
 *   "不足一天按一天"，避免最后一天换套餐时剩余天数被算成 0 而无法补差/抵扣。
 * - periodDays = round((periodEnd - periodStart) / 1天)，作为日单价基准；
 *   月份天数不同（28~31）天然反映在该基准上，无需额外特判。
 * - 单边金额 = floor(monthlyPrice * remainingDays / periodDays)，
 *   全程 BigInt 整数运算后再转回 number，**无浮点误差**；floor 对租户更友好
 *   （补收不多收，抵扣不少退）。
 * - 贷记旧套餐未用天数 + 借记新套餐剩余天数，净额 = debit - credit：
 *   升档（新价>旧价）净额为正 = 补差账单；降档净额为负 = 抵扣账单。
 * - 周期边界（currentPeriodStart/End）**不变**，故下期常规账单仍按新套餐全额出账，
 *   且 proration 仅在换套餐时点结算一次，不会在下期重复。
 */
export function calcProration(params: {
  oldMonthlyPrice: number;
  newMonthlyPrice: number;
  periodStart: Date;
  periodEnd: Date;
  changeAt: Date;
}): ProrationResult {
  const { oldMonthlyPrice, newMonthlyPrice, periodStart, periodEnd, changeAt } =
    params;

  const periodDays = Math.max(
    1,
    Math.round((periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY),
  );

  // changeAt 落在周期内才有剩余天数；clamp 到 [0, periodDays]
  const remainingMs = periodEnd.getTime() - changeAt.getTime();
  const remainingDays = Math.min(
    periodDays,
    Math.max(0, Math.ceil(remainingMs / MS_PER_DAY)),
  );

  // 整数分运算：floor(price * remainingDays / periodDays)
  const proratedCents = (monthlyPrice: number) =>
    Number(
      (BigInt(Math.trunc(monthlyPrice)) * BigInt(remainingDays)) /
        BigInt(periodDays),
    );

  const creditAmount = proratedCents(oldMonthlyPrice);
  const debitAmount = proratedCents(newMonthlyPrice);
  const netAmount = debitAmount - creditAmount;

  const lineItems: InvoiceLineItem[] = [
    {
      type: 'PRORATION_CREDIT',
      amount: -creditAmount,
      remainingDays,
      periodDays,
      planMonthlyPrice: Math.trunc(oldMonthlyPrice),
    },
    {
      type: 'PRORATION_DEBIT',
      amount: debitAmount,
      remainingDays,
      periodDays,
      planMonthlyPrice: Math.trunc(newMonthlyPrice),
    },
  ];

  return {
    periodDays,
    remainingDays,
    creditAmount,
    debitAmount,
    netAmount,
    lineItems,
  };
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
  const baseAmount = assertNonNegativeIntegerCents(
    snapshot.monthlyPrice ?? 0,
    '套餐月费必须是整数分',
  );
  const lineItems: InvoiceLineItem[] = [{ type: 'BASE', amount: baseAmount }];
  let overageAmount = BigInt(0);

  for (const metric of USAGE_METRICS) {
    const planKey = PLAN_KEY_BY_METRIC[metric];
    const quota = assertInteger(
      snapshot.quotas?.[planKey] ?? 0,
      '套餐配额必须是整数',
    );
    const unitPrice = assertNonNegativeIntegerCents(
      snapshot.overagePrices?.[planKey] ?? 0,
      '套餐超额单价必须是整数分',
    );
    const used = assertInteger(usage[metric] ?? 0, '用量必须是整数');

    if (quota === -1) {
      continue;
    }

    const overage = Math.max(0, used - Math.max(quota, 0));
    if (overage <= 0) {
      continue;
    }

    const amount = BigInt(overage) * BigInt(unitPrice);
    overageAmount += amount;
    lineItems.push({
      type: 'OVERAGE',
      metric,
      quota,
      used,
      overage,
      unitPrice,
      amount: toSafeIntegerCents(amount, '超额费用超出安全整数范围'),
    });
  }

  const totalAmount = BigInt(baseAmount) + overageAmount;
  return {
    baseAmount,
    overageAmount: toSafeIntegerCents(
      overageAmount,
      '超额费用超出安全整数范围',
    ),
    totalAmount: toSafeIntegerCents(totalAmount, '账单金额超出安全整数范围'),
    lineItems,
  };
}

function assertInteger(value: unknown, message: string) {
  const amount = Number(value);
  if (!Number.isInteger(amount)) {
    throw new Error(message);
  }
  return amount;
}

function assertNonNegativeIntegerCents(value: unknown, message: string) {
  const amount = assertInteger(value, message);
  if (amount < 0) {
    throw new Error(message);
  }
  return amount;
}

function toSafeIntegerCents(value: bigint, message: string) {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error(message);
  }
  return Number(value);
}
