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

  async createOrder(input: CreateShipOrderDto) {
    const ctx = this.requireContext();
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

  private requireContext() {
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
}
