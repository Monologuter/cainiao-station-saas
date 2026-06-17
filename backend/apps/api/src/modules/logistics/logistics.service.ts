import { Inject, Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import {
  ShipOrderAggregate,
  ShipOrderStatus,
} from '../shipping/ship-order.aggregate';
import {
  LOGISTICS_PROVIDER,
  LogisticsProvider,
} from './logistics-provider.interface';

interface RequestUser {
  userId?: string;
  tenantId?: string | null;
  roles?: string[];
  isPlatform?: boolean;
}

@Injectable()
export class LogisticsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(LOGISTICS_PROVIDER) private readonly provider: LogisticsProvider,
  ) {}

  async collectShipOrder(orderId: string, user?: RequestUser) {
    const ctx = this.requireContext(user);

    return this.tenantPrisma.withTenant(async (tx) => {
      const before = await tx.shipOrder.findFirst({
        where: { id: orderId, tenantId: ctx.tenantId, deletedAt: null },
      });
      if (!before) {
        throw new BizError(ApiCode.NOT_FOUND, '寄件订单不存在');
      }
      if (before.status === 'COLLECTED' && before.waybillNo) {
        return before;
      }

      ShipOrderAggregate.assertTransit(
        before.status as ShipOrderStatus,
        'COLLECTED',
      );

      const waybill = await this.provider.createWaybill({
        shipOrderId: before.id,
        courierCode: before.courierCode,
        sender: before.senderJson,
        receiver: before.receiverJson,
        weightGram: before.weightGram,
      });
      const collectedAt = new Date();
      const order = await tx.shipOrder.update({
        where: { id: before.id },
        data: {
          status: 'COLLECTED',
          waybillNo: waybill.waybillNo,
          collectedAt,
          version: { increment: 1 },
        },
      });
      await tx.logisticsTrack.create({
        data: {
          tenantId: ctx.tenantId,
          shipOrderId: before.id,
          waybillNo: waybill.waybillNo,
          seq: 1,
          nodeStatus: 'COLLECTED',
          location: '始发驿站',
          description: '【揽收】快件已由驿站揽收',
          happenedAt: collectedAt,
          source: 'MOCK',
        },
      });

      return order;
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
}
