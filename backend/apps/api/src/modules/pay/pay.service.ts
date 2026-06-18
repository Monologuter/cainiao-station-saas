import { Inject, Injectable, Optional } from '@nestjs/common';
import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
import { EventBus } from '../../core/event-bus/event-bus';
import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import {
  ShipOrderAggregate,
  ShipOrderStatus,
} from '../shipping/ship-order.aggregate';
import { PAY_CHANNEL, PayChannel } from './pay-channel.interface';

interface RequestUser {
  userId?: string;
  tenantId?: string | null;
  roles?: string[];
  isPlatform?: boolean;
}
const ADAPTER_BREAKER_OPTIONS = {
  failureThreshold: 3,
  coolDownMs: 30_000,
  timeoutMs: 3000,
};

@Injectable()
export class PayService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(PAY_CHANNEL) private readonly channel: PayChannel,
    private readonly eventBus: EventBus,
    @Optional() private readonly breaker?: CircuitBreakerService,
  ) {}

  async payShipOrder(
    orderId: string,
    idempotencyKey: string,
    user?: RequestUser,
  ) {
    if (user?.tenantId && !TenantContext.get()?.tenantId) {
      return TenantContext.run(
        {
          userId: user.userId ?? 'consumer',
          tenantId: user.tenantId,
          roles: user.roles ?? [],
          isPlatform: !!user.isPlatform,
        },
        () => this.payShipOrder(orderId, idempotencyKey, user),
      );
    }
    const ctx = this.requireContext(user);
    const paid = await this.tenantPrisma.withTenant(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: ctx.tenantId,
            idempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.status === 'SUCCESS' || existing.status === 'PENDING') {
          const order = await tx.shipOrder.findFirst({
            where: { id: orderId, tenantId: ctx.tenantId, deletedAt: null },
          });
          if (!order) {
            throw new BizError(ApiCode.NOT_FOUND, '寄件订单不存在');
          }
          return { order, event: null };
        }
        throw new BizError(ApiCode.IDEMPOTENCY_CONFLICT, '支付幂等键已使用');
      }

      const before = await tx.shipOrder.findFirst({
        where: { id: orderId, tenantId: ctx.tenantId, deletedAt: null },
      });
      if (!before) {
        throw new BizError(ApiCode.NOT_FOUND, '寄件订单不存在');
      }
      ShipOrderAggregate.assertTransit(
        before.status as ShipOrderStatus,
        'PAID',
      );

      const result = await this.withBreaker(`pay.${this.channel.code}`, () =>
        this.channel.pay({
          bizType: 'SHIP_ORDER',
          bizId: before.id,
          amount: before.quoteAmount,
          idempotencyKey,
          subject: `寄件订单 ${before.orderNo}`,
        }),
      );
      const paidAt = result.paidAt ?? new Date();
      const payment = await tx.payment.create({
        data: {
          tenantId: ctx.tenantId,
          bizType: 'SHIP_ORDER',
          bizId: before.id,
          channel: this.channel.code,
          amount: before.quoteAmount,
          status: result.status,
          idempotencyKey,
          outTradeNo: result.outTradeNo,
          paidAt: result.status === 'SUCCESS' ? paidAt : null,
          rawJson: result.raw,
          createdBy: ctx.userId,
        },
      });

      if (result.status !== 'SUCCESS') {
        if (result.status === 'PENDING') {
          return { order: before, event: null };
        }
        throw new BizError(ApiCode.BAD_REQUEST, '支付失败，请重试');
      }

      const order = await tx.shipOrder.update({
        where: { id: before.id },
        data: {
          status: 'PAID',
          paidAt,
          version: { increment: 1 },
        },
      });

      return {
        order,
        event: EventBus.createEvent('ShipOrderPaid', {
          tenantId: order.tenantId,
          shipOrderId: order.id,
          orderNo: order.orderNo,
          amount: payment.amount,
          paymentId: payment.id,
          paidAt,
        }),
      };
    });

    if (paid.event) {
      await this.eventBus.publish(paid.event);
    }
    return paid.order;
  }

  async confirmShipOrderPaymentCallback(
    tenantId: string,
    outTradeNo: string,
    payload: Record<string, unknown>,
  ) {
    const confirmed = await TenantContext.run(
      {
        userId: 'pay-callback',
        tenantId,
        roles: [],
        isPlatform: false,
      },
      () =>
        this.tenantPrisma.withTenant(async (tx) => {
          const payment = await tx.payment.findFirst({
            where: {
              tenantId,
              outTradeNo,
              bizType: 'SHIP_ORDER',
              deletedAt: null,
            },
          });
          if (!payment) {
            throw new BizError(ApiCode.NOT_FOUND, '支付单不存在');
          }

          const order = await tx.shipOrder.findFirst({
            where: { id: payment.bizId, tenantId, deletedAt: null },
          });
          if (!order) {
            throw new BizError(ApiCode.NOT_FOUND, '寄件订单不存在');
          }
          if (payment.status === 'SUCCESS') {
            return { order, event: null };
          }

          const result = this.channel.verifyCallback?.({
            ...payload,
            expectedAmount: payment.amount,
          });
          if (!result || result.status !== 'SUCCESS') {
            throw new BizError(ApiCode.BAD_REQUEST, '支付回调校验失败');
          }
          if (result.outTradeNo !== outTradeNo) {
            throw new BizError(ApiCode.BAD_REQUEST, '支付回调订单号不匹配');
          }

          const paidAt = result.paidAt ?? new Date();
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: 'SUCCESS',
              paidAt,
              rawJson: result.raw,
            },
          });

          if (order.status !== 'PAID') {
            ShipOrderAggregate.assertTransit(
              order.status as ShipOrderStatus,
              'PAID',
            );
          }
          const updated = await tx.shipOrder.update({
            where: { id: order.id },
            data: {
              status: 'PAID',
              paidAt,
              version: { increment: 1 },
            },
          });

          return {
            order: updated,
            event: EventBus.createEvent('ShipOrderPaid', {
              tenantId: updated.tenantId,
              shipOrderId: updated.id,
              orderNo: updated.orderNo,
              amount: payment.amount,
              paymentId: payment.id,
              paidAt,
            }),
          };
        }),
    );

    if (confirmed.event) {
      await this.eventBus.publish(confirmed.event);
    }
    return confirmed.order;
  }

  private requireContext(user?: RequestUser) {
    if (user?.tenantId) {
      return {
        userId: user.userId,
        tenantId: user.tenantId,
        roles: user.roles ?? [],
        isPlatform: !!user.isPlatform,
      };
    }
    const ctx = TenantContext.get();
    if (!ctx?.tenantId) {
      throw new BizError(ApiCode.UNAUTHORIZED, '缺少租户上下文');
    }
    return ctx;
  }

  private withBreaker(name: string, action: () => Promise<any>) {
    if (!this.breaker) return action();
    return this.breaker.execute(name, ADAPTER_BREAKER_OPTIONS, action, () => ({
      status: 'FAILED',
      outTradeNo: `CIRCUIT_OPEN_${Date.now()}`,
      raw: { circuitBreaker: 'open', adapter: name },
    }));
  }
}
