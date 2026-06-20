import { Injectable } from '@nestjs/common';
import { EventBus } from '../../../core/event-bus/event-bus';
import { ApiCode, BizError } from '../../../core/http/api-code';
import { TenantPrismaService } from '../../../core/prisma/tenant-prisma.service';
import { TenantContext } from '../../../core/tenant-context/tenant-context';
import { calcInvoice, type UsageByMetric } from './billing-calculator';
import { InvoiceAggregate, type InvoiceStatus } from './invoice.aggregate';

interface GenerateInvoiceInput {
  tenantId?: string;
  subscriptionId: string;
  periodStart?: Date;
  now?: Date;
}

@Injectable()
export class InvoiceService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly eventBus: EventBus,
  ) {}

  async generateInvoice(input: GenerateInvoiceInput) {
    let generatedEvent: ReturnType<typeof EventBus.createEvent> | null = null;
    const invoice = await this.tenantPrisma.withTenant(async (tx) => {
      const subscription = await tx.subscription.findFirst({
        where: {
          id: input.subscriptionId,
          tenantId: input.tenantId,
          deletedAt: null,
        },
      });
      if (!subscription) {
        throw new BizError(ApiCode.NOT_FOUND, '订阅不存在');
      }
      await this.lockSubscription(tx, subscription.id);

      const periodStart = input.periodStart ?? subscription.currentPeriodStart;
      const existing = await tx.invoice.findUnique({
        where: {
          subscriptionId_periodStart: {
            subscriptionId: subscription.id,
            periodStart,
          },
        },
      });
      if (existing) {
        return existing;
      }

      if (periodStart.getTime() !== subscription.currentPeriodStart.getTime()) {
        throw new BizError(ApiCode.BAD_REQUEST, '只能为当前账期出账');
      }

      const usageRecords = await tx.usageRecord.findMany({
        where: {
          tenantId: subscription.tenantId,
          subscriptionId: subscription.id,
          periodStart,
          deletedAt: null,
        },
      });
      const usage = this.toUsageByMetric(usageRecords);
      const billingSnapshot = await this.snapshotForChangedPeriod(tx, {
        tenantId: subscription.tenantId,
        subscriptionId: subscription.id,
        periodStart,
        periodEnd: subscription.currentPeriodEnd,
        snapshot: subscription.planSnapshot,
      });
      const calculation = calcInvoice(billingSnapshot, usage);
      const creditApplication = await this.applyAvailableCredits(tx, {
        tenantId: subscription.tenantId,
        subscriptionId: subscription.id,
        grossTotal: BigInt(calculation.totalAmount),
      });
      const now = input.now ?? new Date();
      const invoice = await tx.invoice.create({
        data: {
          tenantId: subscription.tenantId,
          subscriptionId: subscription.id,
          code: this.invoiceCode(subscription.id, periodStart),
          periodStart,
          periodEnd: subscription.currentPeriodEnd,
          status: creditApplication.netTotal === BigInt(0) ? 'PAID' : 'OPEN',
          baseAmount: BigInt(calculation.baseAmount),
          overageAmount: BigInt(calculation.overageAmount),
          totalAmount: creditApplication.netTotal,
          lineItems: [
            ...calculation.lineItems,
            ...creditApplication.lineItems,
          ],
          issuedAt: now,
          dueAt: this.addDays(now, 7),
          paidAt: creditApplication.netTotal === BigInt(0) ? now : undefined,
          createdBy: TenantContext.get()?.userId,
        },
      });

      const nextStart = subscription.currentPeriodEnd;
      const nextEnd = this.addMonths(nextStart, 1);
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: nextStart,
          currentPeriodEnd: nextEnd,
          nextBillingAt: nextEnd,
        },
      });

      generatedEvent = EventBus.createEvent('InvoiceGenerated', {
        tenantId: invoice.tenantId,
        subscriptionId: invoice.subscriptionId,
        invoiceId: invoice.id,
        totalAmount: Number(invoice.totalAmount),
      });
      return invoice;
    });

    if (generatedEvent) {
      await this.eventBus.publish(generatedEvent);
    }
    return this.toDto(invoice);
  }

  async list(input: { tenantId?: string; status?: string }) {
    const rows = await this.tenantPrisma.withTenant<any[]>((tx) =>
      tx.invoice.findMany({
        where: {
          tenantId: input.tenantId,
          status: input.status,
          deletedAt: null,
        },
        orderBy: { issuedAt: 'desc' },
      }),
    );
    return rows.map((row) => this.toDto(row));
  }

  async detail(id: string, tenantId?: string) {
    const invoice = await this.tenantPrisma.withTenant<any>((tx) =>
      tx.invoice.findFirst({
        where: { id, tenantId, deletedAt: null },
      }),
    );
    if (!invoice) {
      throw new BizError(ApiCode.NOT_FOUND, '账单不存在');
    }
    return this.toDto(invoice);
  }

  async voidInvoice(id: string) {
    const invoice = await this.tenantPrisma.withTenant<any>(async (tx) => {
      const current = await tx.invoice.findFirst({
        where: { id, deletedAt: null },
      });
      if (!current) {
        throw new BizError(ApiCode.NOT_FOUND, '账单不存在');
      }
      InvoiceAggregate.assertVoid(current.status as InvoiceStatus);
      return tx.invoice.update({
        where: { id },
        data: { status: 'VOID' },
      });
    });
    return this.toDto(invoice);
  }

  private toUsageByMetric(rows: Array<{ metric: string; quantity: bigint }>) {
    return rows.reduce<UsageByMetric>((usage, row) => {
      usage[row.metric as keyof UsageByMetric] = Number(row.quantity);
      return usage;
    }, {});
  }

  private async applyAvailableCredits(
    tx: any,
    input: { tenantId: string; subscriptionId: string; grossTotal: bigint },
  ) {
    let remaining = input.grossTotal;
    const lineItems: Array<{
      type: 'CREDIT_APPLIED';
      amount: number;
      sourceInvoiceId: string;
    }> = [];
    if (remaining <= BigInt(0)) {
      return { netTotal: BigInt(0), lineItems };
    }

    const creditInvoices = await tx.invoice.findMany({
      where: {
        tenantId: input.tenantId,
        subscriptionId: input.subscriptionId,
        status: 'CREDIT',
        totalAmount: { lt: BigInt(0) },
        deletedAt: null,
      },
      orderBy: { issuedAt: 'asc' },
    });

    for (const credit of creditInvoices) {
      const available = -BigInt(credit.totalAmount);
      if (available <= BigInt(0) || remaining <= BigInt(0)) {
        continue;
      }
      const applied = available > remaining ? remaining : available;
      const leftover = available - applied;
      const updateResult = await tx.invoice.updateMany({
        where: {
          id: credit.id,
          status: 'CREDIT',
          totalAmount: BigInt(credit.totalAmount),
        },
        data: leftover === BigInt(0)
          ? { status: 'PAID', totalAmount: BigInt(0) }
          : { totalAmount: -leftover },
      });
      if (updateResult.count !== 1) {
        throw new BizError(ApiCode.BAD_REQUEST, '贷记已被并发使用，请重试');
      }
      remaining -= applied;
      lineItems.push({
        type: 'CREDIT_APPLIED',
        amount: -this.toSafeNumber(applied),
        sourceInvoiceId: credit.id,
      });
    }

    return { netTotal: remaining, lineItems };
  }

  private async snapshotForChangedPeriod(
    tx: any,
    input: {
      tenantId: string;
      subscriptionId: string;
      periodStart: Date;
      periodEnd: Date;
      snapshot: any;
    },
  ) {
    const adjustments = await tx.invoice.findMany({
      where: {
        tenantId: input.tenantId,
        subscriptionId: input.subscriptionId,
        periodStart: { gt: input.periodStart, lt: input.periodEnd },
        status: { in: ['OPEN', 'PAID', 'CREDIT'] },
        deletedAt: null,
      },
      orderBy: { periodStart: 'asc' },
    });
    for (const adjustment of adjustments) {
      const creditLine = Array.isArray(adjustment.lineItems)
        ? adjustment.lineItems.find(
            (item: any) =>
              item?.type === 'PRORATION_CREDIT' &&
              Number.isInteger(item.planMonthlyPrice),
          )
        : null;
      if (creditLine) {
        return {
          ...input.snapshot,
          monthlyPrice: creditLine.planMonthlyPrice,
        };
      }
    }
    return input.snapshot;
  }

  private invoiceCode(subscriptionId: string, periodStart: Date) {
    const y = periodStart.getUTCFullYear();
    const m = String(periodStart.getUTCMonth() + 1).padStart(2, '0');
    return `INV-${y}${m}-${subscriptionId.slice(0, 8)}`;
  }

  private async lockSubscription(tx: any, subscriptionId: string) {
    if (!tx.$queryRawUnsafe) {
      return;
    }
    await tx.$queryRawUnsafe(
      'SELECT id FROM "subscriptions" WHERE id = $1 FOR UPDATE',
      subscriptionId,
    );
  }

  private addMonths(date: Date, months: number) {
    const next = new Date(date);
    next.setUTCMonth(next.getUTCMonth() + months);
    return next;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private toDto(row: any) {
    return {
      ...row,
      baseAmount: Number(row.baseAmount),
      overageAmount: Number(row.overageAmount),
      totalAmount: Number(row.totalAmount),
    };
  }

  private toSafeNumber(amount: bigint) {
    if (
      amount > BigInt(Number.MAX_SAFE_INTEGER) ||
      amount < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      throw new BizError(ApiCode.BAD_REQUEST, '金额超出安全整数范围');
    }
    return Number(amount);
  }
}
