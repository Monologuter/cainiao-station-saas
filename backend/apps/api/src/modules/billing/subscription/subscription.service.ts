import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../../core/http/api-code';
import { TenantPrismaService } from '../../../core/prisma/tenant-prisma.service';
import { TenantContext } from '../../../core/tenant-context/tenant-context';
import { calcProration } from '../invoice/billing-calculator';
import {
  SubscriptionAggregate,
  type SubscriptionStatus,
} from './subscription.aggregate';

const ACTIVE_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'];

interface SubscribeInput {
  tenantId: string;
  stationId?: string;
  planId?: string;
  planCode?: string;
  now?: Date;
  tx?: any;
}

@Injectable()
export class SubscriptionService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async subscribe(input: SubscribeInput) {
    const now = input.now ?? new Date();
    const periodEnd = this.addMonths(now, 1);
    const subscribeWithTx = async (tx: any) => {
      const existing = await tx.subscription.findFirst({
        where: {
          tenantId: input.tenantId,
          stationId: input.stationId,
          status: { in: ACTIVE_STATUSES as any },
          deletedAt: null,
        },
      });
      if (existing) {
        throw new BizError(ApiCode.BAD_REQUEST, '门店已有有效订阅');
      }
      if (!input.planId && !input.planCode) {
        throw new BizError(ApiCode.BAD_REQUEST, '请选择套餐');
      }
      const plan = await tx.billingPlan.findFirst({
        where: input.planId
          ? { id: input.planId, status: 'ACTIVE', deletedAt: null }
          : { code: input.planCode, status: 'ACTIVE', deletedAt: null },
      });
      if (!plan) {
        throw new BizError(ApiCode.NOT_FOUND, '套餐不存在或未上架');
      }

      return tx.subscription.create({
        data: {
          tenantId: input.tenantId,
          stationId: input.stationId,
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          nextBillingAt: periodEnd,
          startedAt: now,
          planSnapshot: this.snapshotPlan(plan),
        },
      });
    };
    const subscription = input.tx
      ? await subscribeWithTx(input.tx)
      : await this.tenantPrisma.withTenant(subscribeWithTx);
    return this.toDto(subscription);
  }

  async list(input: { tenantId?: string; status?: string }) {
    const rows = await this.tenantPrisma.withTenant<any[]>((tx) =>
      tx.subscription.findMany({
        where: {
          tenantId: input.tenantId,
          status: input.status as any,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
    return rows.map((row) => this.toDto(row));
  }

  async renew(id: string, input: { tenantId?: string; planId?: string } = {}) {
    const updated = await this.tenantPrisma.withTenant(async (tx) => {
      const current = await this.requireSubscription(tx, id, input.tenantId);
      SubscriptionAggregate.assertRenew(current.status as SubscriptionStatus);
      const plan = input.planId
        ? await tx.billingPlan.findFirst({
            where: { id: input.planId, status: 'ACTIVE', deletedAt: null },
          })
        : null;
      if (input.planId && !plan) {
        throw new BizError(ApiCode.NOT_FOUND, '套餐不存在或未上架');
      }
      const nextStart = current.currentPeriodEnd;
      const nextEnd = this.addMonths(nextStart, 1);
      return tx.subscription.update({
        where: { id },
        data: {
          planId: plan?.id ?? current.planId,
          planSnapshot: plan ? this.snapshotPlan(plan) : current.planSnapshot,
          currentPeriodStart: nextStart,
          currentPeriodEnd: nextEnd,
          nextBillingAt: nextEnd,
          status: 'ACTIVE',
        },
      });
    });
    return this.toDto(updated);
  }

  async changePlan(
    id: string,
    planId: string,
    tenantId?: string,
    now?: Date,
  ) {
    const updated = await this.tenantPrisma.withTenant(async (tx) => {
      const current = await this.requireSubscription(tx, id, tenantId);
      // 状态守卫：仅 ACTIVE/TRIALING 订阅可换套餐；
      // CANCELED/EXPIRED/PAST_DUE/SUSPENDED 抛 ILLEGAL_TRANSITION。
      SubscriptionAggregate.assertChangePlan(
        current.status as SubscriptionStatus,
      );
      const plan = await tx.billingPlan.findFirst({
        where: { id: planId, status: 'ACTIVE', deletedAt: null },
      });
      if (!plan) {
        throw new BizError(ApiCode.NOT_FOUND, '套餐不存在或未上架');
      }

      const changeAt = now ?? new Date();
      const newSnapshot = this.snapshotPlan(plan);

      // 月中 proration：按剩余自然日，贷记旧套餐未用天数 + 借记新套餐剩余天数，
      // 生成一笔调整账单（整数分）。仅当新旧月费不同且仍有剩余天数时生成。
      const oldMonthlyPrice = Number(current.planSnapshot?.monthlyPrice ?? 0);
      const newMonthlyPrice = newSnapshot.monthlyPrice;
      const proration = calcProration({
        oldMonthlyPrice,
        newMonthlyPrice,
        periodStart: current.currentPeriodStart,
        periodEnd: current.currentPeriodEnd,
        changeAt,
      });

      // 周期边界不变（currentPeriodStart/End 保持原值）：
      // 取舍——换套餐不重置账期，proration 已结清本周期差额，
      // 下期常规账单按新套餐全额出账且不会重复 proration（见 invoice.service 去重）。
      const subscription = await tx.subscription.update({
        where: { id: current.id },
        data: {
          planId: plan.id,
          planSnapshot: newSnapshot,
        },
      });

      // 净额为 0（同价换套餐或剩余天数为 0）则不出调整账单。
      if (proration.netAmount !== 0) {
        await this.writeProrationInvoice(tx, current, proration, changeAt);
      }

      return subscription;
    });
    return this.toDto(updated);
  }

  /**
   * 写入 proration 调整账单。
   * 复用 Invoice 既有去重约束 @@unique([subscriptionId, periodStart])：
   * 以换套餐时点 changeAt 作为 periodStart，与常规账期的
   * currentPeriodStart 天然区分，且同一时点重复换套餐为幂等（命中已存在则跳过）。
   * 金额为整数分（BigInt），净额 netAmount 升档为正(补差)/降档为负(抵扣)。
   */
  private async writeProrationInvoice(
    tx: any,
    subscription: any,
    proration: ReturnType<typeof calcProration>,
    changeAt: Date,
  ) {
    const existing = await tx.invoice.findUnique({
      where: {
        subscriptionId_periodStart: {
          subscriptionId: subscription.id,
          periodStart: changeAt,
        },
      },
    });
    if (existing) {
      return existing;
    }
    return tx.invoice.create({
      data: {
        tenantId: subscription.tenantId,
        subscriptionId: subscription.id,
        code: this.prorationInvoiceCode(subscription.id, changeAt),
        periodStart: changeAt,
        periodEnd: subscription.currentPeriodEnd,
        status: 'OPEN',
        baseAmount: BigInt(0),
        overageAmount: BigInt(0),
        totalAmount: BigInt(proration.netAmount),
        lineItems: proration.lineItems,
        issuedAt: changeAt,
        dueAt: this.addDays(changeAt, 7),
        createdBy: TenantContext.get()?.userId,
      },
    });
  }

  private prorationInvoiceCode(subscriptionId: string, changeAt: Date) {
    const y = changeAt.getUTCFullYear();
    const m = String(changeAt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(changeAt.getUTCDate()).padStart(2, '0');
    return `ADJ-${y}${m}${d}-${subscriptionId.slice(0, 8)}`;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  async cancel(id: string, tenantId?: string) {
    const updated = await this.tenantPrisma.withTenant(async (tx) => {
      const current = await this.requireSubscription(tx, id, tenantId);
      SubscriptionAggregate.assertCancel(current.status as SubscriptionStatus);
      return tx.subscription.update({
        where: { id: current.id },
        data: { status: 'CANCELED', canceledAt: new Date() },
      });
    });
    return this.toDto(updated);
  }

  async suspend(id: string) {
    const updated = await this.tenantPrisma.withTenant(async (tx) => {
      const current = await this.requireSubscription(tx, id);
      return tx.subscription.update({
        where: { id: current.id },
        data: { status: 'SUSPENDED' },
      });
    });
    return this.toDto(updated);
  }

  async resume(id: string) {
    const updated = await this.tenantPrisma.withTenant(async (tx) => {
      const current = await this.requireSubscription(tx, id);
      SubscriptionAggregate.assertResume(current.status as SubscriptionStatus);
      return tx.subscription.update({
        where: { id: current.id },
        data: { status: 'ACTIVE' },
      });
    });
    return this.toDto(updated);
  }

  private async requireSubscription(tx: any, id: string, tenantId?: string) {
    const subscription = tenantId
      ? await tx.subscription.findFirst({
          where: { id, tenantId, deletedAt: null },
        })
      : await tx.subscription.findUnique({ where: { id } });
    if (!subscription) {
      throw new BizError(ApiCode.NOT_FOUND, '订阅不存在');
    }
    return subscription;
  }

  private snapshotPlan(plan: any) {
    return {
      monthlyPrice: Number(plan.monthlyPrice),
      quotas: plan.quotas,
      overagePrices: plan.overagePrices,
    };
  }

  private addMonths(date: Date, months: number) {
    const next = new Date(date);
    next.setUTCMonth(next.getUTCMonth() + months);
    return next;
  }

  private toDto(row: any) {
    return {
      ...row,
      planSnapshot: row.planSnapshot,
    };
  }
}
