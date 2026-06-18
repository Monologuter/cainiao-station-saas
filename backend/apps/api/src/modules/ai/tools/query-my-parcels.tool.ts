import { Injectable } from '@nestjs/common';
import { ParcelService } from '../../parcel/parcel.service';
import {
  AssistantTool,
  AssistantToolContext,
  AssistantToolResult,
} from './assistant-tool.types';

@Injectable()
export class QueryMyParcelsTool implements AssistantTool {
  readonly name = 'query_my_parcels' as const;

  constructor(private readonly parcels: ParcelService) {}

  async execute(
    args: Record<string, unknown>,
    ctx: AssistantToolContext,
  ): Promise<AssistantToolResult> {
    if (!ctx.verifiedPhone) {
      return {
        isError: true,
        code: 'PHONE_NOT_VERIFIED',
        message: '需要先完成手机号验证后才能查询包裹。',
      };
    }

    const rows = await this.parcels.listForAssistantTool({
      tenantId: ctx.tenantId,
      receiverPhone: ctx.verifiedPhone,
      status: this.parseStatus(args.status),
      limit: 10,
    });

    return {
      isError: false,
      items: rows.map((parcel: any) => ({
        id: parcel.id,
        waybillNo: parcel.waybillNo,
        carrier: parcel.carrier,
        status: parcel.status,
        pickupCode: parcel.pickupCode,
        receiverPhoneMasked: this.maskPhone(parcel.receiverPhone),
        storedAt: parcel.storedAt,
        stationName: parcel.station?.name,
        slotCode: parcel.slot?.code,
      })),
    };
  }

  private parseStatus(value: unknown) {
    return typeof value === 'string' && value ? value : 'STORED';
  }

  private maskPhone(phone: string) {
    if (phone.length < 7) {
      return '****';
    }
    return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  }
}
