import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../../core/http/api-code';
import { TenantPrismaService } from '../../../core/prisma/tenant-prisma.service';

const METERABLE_SUBSCRIPTION_STATUSES = ['ACTIVE', 'PAST_DUE'];

interface MeterInput {
  tenantId: string;
  stationId?: string;
  eventId: string;
  metric: string;
  quantity?: number;
  eventAt?: Date;
}

@Injectable()
export class UsageService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async meter(input: MeterInput) {
    const quantity = input.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BizError(ApiCode.BAD_REQUEST, '计量数量必须为正整数');
    }

    const eventAt = input.eventAt ?? new Date();
    const result = await this.tenantPrisma.withTenant(async (tx) => {
      const subscription = await tx.subscription.findFirst({
        where: {
          tenantId: input.tenantId,
          stationId: input.stationId,
          status: { in: METERABLE_SUBSCRIPTION_STATUSES },
          currentPeriodStart: { lte: eventAt },
          currentPeriodEnd: { gt: eventAt },
          deletedAt: null,
        },
        orderBy: { currentPeriodStart: 'desc' },
      });
      if (!subscription) {
        throw new BizError(ApiCode.NOT_FOUND, '未找到有效订阅');
      }

      const dedup = await tx.usageDedup.createMany({
        data: [
          {
            tenantId: input.tenantId,
            eventId: input.eventId,
            subscriptionId: subscription.id,
            metric: input.metric,
          },
        ],
        skipDuplicates: true,
      });
      if (dedup.count === 0) {
        return { counted: false, duplicate: true };
      }

      const usage = await tx.usageRecord.upsert({
        where: {
          subscriptionId_periodStart_metric: {
            subscriptionId: subscription.id,
            periodStart: subscription.currentPeriodStart,
            metric: input.metric,
          },
        },
        update: {
          quantity: { increment: BigInt(quantity) },
          lastEventAt: eventAt,
        },
        create: {
          tenantId: input.tenantId,
          subscriptionId: subscription.id,
          periodStart: subscription.currentPeriodStart,
          metric: input.metric,
          quantity: BigInt(quantity),
          lastEventAt: eventAt,
        },
      });

      return {
        counted: true,
        duplicate: false,
        subscriptionId: subscription.id,
        periodStart: subscription.currentPeriodStart,
        metric: usage.metric,
        quantity: Number(usage.quantity),
      };
    });

    return result;
  }

  async list(input: {
    tenantId?: string;
    subscriptionId?: string;
    metric?: string;
  }) {
    const rows = await this.tenantPrisma.withTenant<any[]>((tx) =>
      tx.usageRecord.findMany({
        where: {
          tenantId: input.tenantId,
          subscriptionId: input.subscriptionId,
          metric: input.metric,
          deletedAt: null,
        },
        orderBy: [{ periodStart: 'desc' }, { metric: 'asc' }],
      }),
    );
    return rows.map((row) => ({
      ...row,
      quantity: Number(row.quantity),
    }));
  }
}
