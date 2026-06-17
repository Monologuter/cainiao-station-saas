import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { EventBus } from '../../core/event-bus/event-bus';
import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { CourierSelectorService } from './courier-selector.service';
import { CreateShipOrderDto } from './dto/create-ship-order.dto';
import { QuoteDto } from './dto/quote.dto';
import { PricingService } from './pricing.service';

interface ListShipOrdersInput {
  status?: string;
  stationId?: string;
  page?: string;
  size?: string;
}

interface RequestUser {
  userId?: string;
  tenantId?: string | null;
  roles?: string[];
  isPlatform?: boolean;
}

@Injectable()
export class ShippingService {
  constructor(
    private readonly courierSelector: CourierSelectorService,
    private readonly pricing: PricingService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly eventBus: EventBus,
  ) {}

  quote(input: QuoteDto) {
    return this.courierSelector.rank({
      sender: input.sender,
      receiver: input.receiver,
      weightGram: input.weightGram,
      preference: input.preference,
    });
  }

  async createOrder(input: CreateShipOrderDto, user?: RequestUser) {
    const ctx = this.requireContext(user);
    const zone = this.courierSelector.resolveZone(input.sender, input.receiver);
    const quote = await this.pricing.quote(
      input.courierCode,
      zone,
      input.item.weightGram,
    );

    const order = await this.tenantPrisma.withTenant<any>((tx) =>
      tx.shipOrder.create({
        data: {
          tenantId: ctx.tenantId,
          stationId: input.stationId,
          orderNo: this.nextOrderNo(),
          channel: input.channel,
          status: 'CREATED',
          senderJson: input.sender,
          receiverJson: input.receiver,
          itemJson: input.item,
          weightGram: input.item.weightGram,
          courierCode: quote.courierCode,
          courierName: quote.courierName,
          quoteAmount: quote.amount,
          quoteSnapshotJson: {
            zone,
            amount: quote.amount,
            estHours: quote.estHours,
            courierCode: quote.courierCode,
            courierName: quote.courierName,
            ruleId: quote.ruleId,
            breakdown: quote.breakdown,
          },
          createdBy: ctx.userId,
        },
      }),
    );

    await this.eventBus.publish(
      EventBus.createEvent('ShipOrderCreated', {
        tenantId: order.tenantId,
        shipOrderId: order.id,
        orderNo: order.orderNo,
        courierCode: order.courierCode,
        quoteAmount: order.quoteAmount,
        channel: order.channel,
        createdBy: order.createdBy,
      }),
    );

    return order;
  }

  async listOrders(input: ListShipOrdersInput, user?: RequestUser) {
    const ctx = this.requireContext(user);
    const page = this.parsePositiveInt(input.page, 1);
    const size = Math.min(this.parsePositiveInt(input.size, 20), 100);
    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      deletedAt: null,
    };
    if (input.status) {
      where.status = input.status;
    }
    if (input.stationId) {
      where.stationId = input.stationId;
    }

    return this.tenantPrisma.withTenant(async (tx) => {
      const [total, list] = await Promise.all([
        tx.shipOrder.count({ where }),
        tx.shipOrder.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * size,
          take: size,
        }),
      ]);

      return {
        list: list.map((order: any) => this.toOrderDto(order)),
        total,
        page,
        size,
      };
    });
  }

  async getOrder(id: string, user?: RequestUser) {
    const ctx = this.requireContext(user);
    return this.tenantPrisma.withTenant(async (tx) => {
      const order = await tx.shipOrder.findFirst({
        where: { id, tenantId: ctx.tenantId, deletedAt: null },
        include: {
          station: true,
          logisticsTracks: { orderBy: { seq: 'asc' } },
        },
      });
      if (!order) {
        throw new BizError(ApiCode.NOT_FOUND, '寄件订单不存在');
      }
      return this.toOrderDto(order);
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

  private nextOrderNo() {
    const random = randomInt(1000, 9999);
    return `SO${Date.now()}${random}`;
  }

  private parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return fallback;
    }
    return parsed;
  }

  private toOrderDto(order: any) {
    return {
      id: order.id,
      tenantId: order.tenantId,
      stationId: order.stationId,
      orderNo: order.orderNo,
      channel: order.channel,
      status: order.status,
      senderJson: order.senderJson,
      receiverJson: order.receiverJson,
      itemJson: order.itemJson,
      weightGram: order.weightGram,
      courierCode: order.courierCode,
      courierName: order.courierName,
      quoteAmount: order.quoteAmount,
      quoteSnapshotJson: order.quoteSnapshotJson,
      consumerId: order.consumerId,
      waybillNo: order.waybillNo,
      paidAt: order.paidAt,
      collectedAt: order.collectedAt,
      deliveredAt: order.deliveredAt,
      cancelledAt: order.cancelledAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      station: order.station
        ? {
            id: order.station.id,
            name: order.station.name,
            code: order.station.code,
          }
        : undefined,
      tracks: order.logisticsTracks?.map((track: any) => ({
        id: track.id,
        seq: track.seq,
        nodeStatus: track.nodeStatus,
        location: track.location,
        description: track.description,
        happenedAt: track.happenedAt,
      })),
    };
  }
}
