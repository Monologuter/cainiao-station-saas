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

      const advanced = await tx.shipOrder.updateMany({
        where: { id: before.id, status: before.status, deletedAt: null },
        data: {
          status: 'PAID',
          paidAt,
          version: { increment: 1 },
        },
      });
      if (advanced.count !== 1) {
        // 并发支付：另一事务已推进订单状态，本次推进作废以保证只生效一次。
        throw new BizError(
          ApiCode.IDEMPOTENCY_CONFLICT,
          '寄件订单状态已被并发推进',
        );
      }
      const order = await tx.shipOrder.findFirst({
        where: { id: before.id, tenantId: ctx.tenantId, deletedAt: null },
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

          let updated = order;
          if (order.status !== 'PAID') {
            ShipOrderAggregate.assertTransit(
              order.status as ShipOrderStatus,
              'PAID',
            );
            const advanced = await tx.shipOrder.updateMany({
              where: { id: order.id, status: order.status, deletedAt: null },
              data: {
                status: 'PAID',
                paidAt,
                version: { increment: 1 },
              },
            });
            if (advanced.count !== 1) {
              // 并发回调：另一事务已把订单推进至 PAID，幂等返回当前最新态。
              const current = await tx.shipOrder.findFirst({
                where: { id: order.id, tenantId, deletedAt: null },
              });
              return { order: current, event: null };
            }
            updated = await tx.shipOrder.findFirst({
              where: { id: order.id, tenantId, deletedAt: null },
            });
          }

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

  async refundShipOrder(
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
        () => this.refundShipOrder(orderId, idempotencyKey, user),
      );
    }
    const ctx = this.requireContext(user);
    return this.tenantPrisma.withTenant(async (tx) => {
      const order = await tx.shipOrder.findFirst({
        where: { id: orderId, tenantId: ctx.tenantId, deletedAt: null },
      });
      if (!order) {
        throw new BizError(ApiCode.NOT_FOUND, '寄件订单不存在');
      }
      if (order.status === 'CANCELLED') {
        return order;
      }
      if (order.status !== 'PAID' || order.collectedAt) {
        throw new BizError(
          ApiCode.SHIPPING_ILLEGAL_TRANSITION,
          '当前订单不可退款',
        );
      }
      const payment = await tx.payment.findFirst({
        where: {
          tenantId: ctx.tenantId,
          bizType: 'SHIP_ORDER',
          bizId: order.id,
          status: 'SUCCESS',
          deletedAt: null,
        },
      });
      if (!payment) {
        throw new BizError(ApiCode.NOT_FOUND, '支付单不存在');
      }

      const refundNo = `refund:${idempotencyKey}`;
      const result = this.channel.refund
        ? await this.channel.refund({
            outTradeNo: payment.outTradeNo,
            refundNo,
            amount: payment.amount,
            refundAmount: payment.amount,
            reason: '寄件订单取消退款',
          })
        : { status: 'SUCCESS' as const, refundNo, raw: { provider: 'mock' } };
      if (result.status !== 'SUCCESS') {
        throw new BizError(ApiCode.BAD_REQUEST, '退款失败，请重试');
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'REFUNDED',
          rawJson: {
            ...(payment.rawJson ?? {}),
            refund: result.raw,
            refundNo: result.refundNo,
          },
        },
      });
      return tx.shipOrder.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          version: { increment: 1 },
        },
      });
    });
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
