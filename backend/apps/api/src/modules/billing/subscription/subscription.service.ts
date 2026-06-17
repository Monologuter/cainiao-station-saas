import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../../core/http/api-code';
import { TenantPrismaService } from '../../../core/prisma/tenant-prisma.service';
import {
  SubscriptionAggregate,
  type SubscriptionStatus,
} from './subscription.aggregate';

const ACTIVE_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'];

interface SubscribeInput {
  tenantId: string;
  stationId?: string;
  planId: string;
  now?: Date;
}

@Injectable()
export class SubscriptionService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async subscribe(input: SubscribeInput) {
    const now = input.now ?? new Date();
    const periodEnd = this.addMonths(now, 1);
    const subscription = await this.tenantPrisma.withTenant(async (tx) => {
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
      const plan = await tx.billingPlan.findFirst({
        where: { id: input.planId, status: 'ACTIVE', deletedAt: null },
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
    });
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

  async changePlan(id: string, planId: string, tenantId?: string) {
    const updated = await this.tenantPrisma.withTenant(async (tx) => {
      const current = await this.requireSubscription(tx, id, tenantId);
      const plan = await tx.billingPlan.findFirst({
        where: { id: planId, status: 'ACTIVE', deletedAt: null },
      });
      if (!plan) {
        throw new BizError(ApiCode.NOT_FOUND, '套餐不存在或未上架');
      }
      return tx.subscription.update({
        where: { id: current.id },
        data: {
          planId: plan.id,
          planSnapshot: this.snapshotPlan(plan),
        },
      });
    });
    return this.toDto(updated);
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
