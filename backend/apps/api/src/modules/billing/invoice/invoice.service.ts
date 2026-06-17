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
      const calculation = calcInvoice(subscription.planSnapshot, usage);
      const now = input.now ?? new Date();
      const invoice = await tx.invoice.create({
        data: {
          tenantId: subscription.tenantId,
          subscriptionId: subscription.id,
          code: this.invoiceCode(subscription.id, periodStart),
          periodStart,
          periodEnd: subscription.currentPeriodEnd,
          status: 'OPEN',
          baseAmount: BigInt(calculation.baseAmount),
          overageAmount: BigInt(calculation.overageAmount),
          totalAmount: BigInt(calculation.totalAmount),
          lineItems: calculation.lineItems,
          issuedAt: now,
          dueAt: this.addDays(now, 7),
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

  private invoiceCode(subscriptionId: string, periodStart: Date) {
    const y = periodStart.getUTCFullYear();
    const m = String(periodStart.getUTCMonth() + 1).padStart(2, '0');
    return `INV-${y}${m}-${subscriptionId.slice(0, 8)}`;
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
}
