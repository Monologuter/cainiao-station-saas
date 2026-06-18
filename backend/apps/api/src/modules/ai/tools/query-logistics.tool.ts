import { Injectable } from '@nestjs/common';
import { LogisticsService } from '../../logistics/logistics.service';
import { ParcelService } from '../../parcel/parcel.service';
import { ShippingService } from '../../shipping/shipping.service';
import {
  AssistantTool,
  AssistantToolContext,
  AssistantToolResult,
} from './assistant-tool.types';

@Injectable()
export class QueryLogisticsTool implements AssistantTool {
  readonly name = 'query_logistics' as const;

  constructor(
    private readonly parcels: ParcelService,
    private readonly shipping: ShippingService,
    private readonly logistics: LogisticsService,
  ) {}

  async execute(
    args: Record<string, unknown>,
    ctx: AssistantToolContext,
  ): Promise<AssistantToolResult> {
    const parcelId = this.stringArg(args.parcelId);
    const shipOrderId =
      this.stringArg(args.shipOrderId) ?? this.stringArg(args.orderId);

    if (parcelId) {
      return this.queryParcelLogistics(parcelId, ctx);
    }
    if (shipOrderId) {
      return this.queryShipOrderLogistics(shipOrderId, ctx);
    }
    return {
      isError: true,
      code: 'MISSING_TARGET',
      message: '缺少要查询的包裹或寄件订单。',
    };
  }

  private async queryParcelLogistics(
    parcelId: string,
    ctx: AssistantToolContext,
  ): Promise<AssistantToolResult> {
    if (!ctx.verifiedPhone) {
      return {
        isError: true,
        code: 'PHONE_NOT_VERIFIED',
        message: '需要先完成手机号验证后才能查询物流。',
      };
    }
    const parcel = await this.parcels.getAssistantOwnedParcel({
      tenantId: ctx.tenantId,
      parcelId,
      receiverPhone: ctx.verifiedPhone,
    });
    if (!parcel) {
      return this.notOwned();
    }
    return {
      isError: false,
      targetType: 'PARCEL',
      parcelId: parcel.id,
      status: parcel.status,
      stationName: parcel.station?.name,
      tracks: [],
      message: '该包裹为到站取件包裹，暂无外部物流轨迹。',
    };
  }

  private async queryShipOrderLogistics(
    shipOrderId: string,
    ctx: AssistantToolContext,
  ): Promise<AssistantToolResult> {
    if (!ctx.consumerId) {
      return this.notOwned();
    }
    const order = await this.findConsumerOrder(shipOrderId, ctx.consumerId);
    if (!order) {
      return this.notOwned();
    }
    const tracks = await this.logistics.getTracks(shipOrderId, {
      userId: 'assistant-tool',
      tenantId: order.tenantId,
      roles: [],
      isPlatform: false,
    });
    return {
      isError: false,
      targetType: 'SHIP_ORDER',
      shipOrderId: order.id,
      orderNo: order.orderNo,
      status: order.status,
      tracks: tracks.map((track: any) => ({
        seq: track.seq,
        nodeStatus: track.nodeStatus,
        location: track.location,
        description: track.description,
        happenedAt: track.happenedAt,
      })),
    };
  }

  private async findConsumerOrder(shipOrderId: string, consumerId: string) {
    try {
      return await this.shipping.getConsumerOrder(shipOrderId, {
        sub: consumerId,
      });
    } catch {
      return null;
    }
  }

  private notOwned(): AssistantToolResult {
    return {
      isError: true,
      code: 'NOT_OWNED',
      message: '未找到可由当前用户查询的物流信息。',
    };
  }

  private stringArg(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
