import { Inject, Injectable } from '@nestjs/common';
import { EventBus } from '../../../core/event-bus/event-bus';
import { ApiCode, BizError } from '../../../core/http/api-code';
import { TenantPrismaService } from '../../../core/prisma/tenant-prisma.service';
import { TenantContext } from '../../../core/tenant-context/tenant-context';
import { PAY_CHANNEL, PayChannel } from '../../pay/pay-channel.interface';
import { ExpiryCheckProcessor } from '../jobs/expiry-check.processor';

const PAYABLE_INVOICE_STATUSES = ['OPEN', 'OVERDUE'];

@Injectable()
export class SubscriptionPayService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(PAY_CHANNEL) private readonly channel: PayChannel,
    private readonly eventBus: EventBus,
    private readonly expiryCheck: ExpiryCheckProcessor,
  ) {}

  async payInvoice(invoiceId: string, idempotencyKey: string) {
    const ctx = this.requireContext();
    let paidEvent: ReturnType<typeof EventBus.createEvent> | null = null;
    const paid = await this.tenantPrisma.withTenant(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: {
          id: invoiceId,
          tenantId: ctx.isPlatform ? undefined : ctx.tenantId,
          deletedAt: null,
        },
      });
      if (!invoice) {
        throw new BizError(ApiCode.NOT_FOUND, '账单不存在');
      }

      const existing = await tx.payment.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: invoice.tenantId,
            idempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.status === 'SUCCESS' && existing.bizId === invoice.id) {
          return invoice;
        }
        throw new BizError(ApiCode.IDEMPOTENCY_CONFLICT, '支付幂等键已使用');
      }

      if (!PAYABLE_INVOICE_STATUSES.includes(invoice.status)) {
        throw new BizError(ApiCode.ILLEGAL_TRANSITION, '账单状态不允许支付');
      }

      const result = await this.channel.pay({
        bizType: 'SUBSCRIPTION_INVOICE',
        bizId: invoice.id,
        amount: Number(invoice.totalAmount),
        idempotencyKey,
        subject: `订阅账单 ${invoice.code}`,
      });
      const paidAt = result.paidAt ?? new Date();
      const payment = await tx.payment.create({
        data: {
          tenantId: invoice.tenantId,
          bizType: 'SUBSCRIPTION_INVOICE',
          bizId: invoice.id,
          channel: this.channel.code,
          amount: Number(invoice.totalAmount),
          status: result.status,
          idempotencyKey,
          outTradeNo: result.outTradeNo,
          paidAt: result.status === 'SUCCESS' ? paidAt : null,
          rawJson: result.raw,
          createdBy: ctx.userId,
        },
      });
      if (result.status !== 'SUCCESS') {
        throw new BizError(ApiCode.BAD_REQUEST, '支付失败，请重试');
      }

      const updated = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'PAID', paymentId: payment.id, paidAt },
      });
      await tx.subscription.updateMany({
        where: {
          id: invoice.subscriptionId,
          status: { in: ['PAST_DUE', 'SUSPENDED'] },
        },
        data: { status: 'ACTIVE' },
      });
      paidEvent = EventBus.createEvent('SubscriptionInvoicePaid', {
        tenantId: updated.tenantId,
        invoiceId: updated.id,
        subscriptionId: updated.subscriptionId,
        paymentId: payment.id,
        amount: Number(updated.totalAmount),
      });
      return updated;
    });

    if (paidEvent) {
      await this.eventBus.publish(paidEvent);
      await this.expiryCheck.restoreTenantIfCleared(paid.tenantId);
    }
    return this.toDto(paid);
  }

  async handleCallback(_payload: unknown) {
    return { handled: true };
  }

  private requireContext() {
    const ctx = TenantContext.get();
    if (!ctx?.tenantId && !ctx?.isPlatform) {
      throw new BizError(ApiCode.UNAUTHORIZED, '缺少租户上下文');
    }
    return ctx;
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
