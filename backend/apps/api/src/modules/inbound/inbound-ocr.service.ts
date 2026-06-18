import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { OcrClient } from '../ai/ocr.client';
import { mapOcrResult } from '../ai/ocr-result.mapper';
import { FileStorageService } from '../file/file-storage.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { ApiCode, BizError } from '../../core/http/api-code';
import { InboundService } from './inbound.service';

interface RecognizeInput {
  stationId: string;
  image: Buffer;
  filename: string;
  contentType: string;
}

interface RecognizeBatchInput {
  stationId: string;
  images: Array<Omit<RecognizeInput, 'stationId'>>;
}

interface ConfirmInput {
  recognitionId: string;
  waybillNo: string;
  phone: string;
  courierCode?: string;
}

@Injectable()
export class InboundOcrService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: FileStorageService,
    private readonly ocr: OcrClient,
    private readonly inbound: InboundService,
  ) {}

  async recognize(input: RecognizeInput) {
    const ctx = this.requireTenantContext();
    const file = this.files.createWaybillImageObject({
      tenantId: ctx.tenantId,
      contentType: input.contentType,
    });
    const fileId = randomUUID();
    const result = await this.ocr.recognizeWaybill({
      image: input.image,
      filename: input.filename,
      contentType: input.contentType,
      requestId: ctx.traceId ?? randomUUID(),
    });
    const mapped = mapOcrResult(result);

    const record = await this.tenantPrisma.withTenant<any>((tx) =>
      tx.ocrRecognition.create({
        data: {
          tenantId: ctx.tenantId,
          stationId: input.stationId,
          fileId,
          provider: mapped.provider,
          waybillNo: mapped.waybillNo,
          phoneTail: mapped.phoneTail,
          courierCode: mapped.courierCode,
          confidence: mapped.confidence,
          status: mapped.status,
          latencyMs: mapped.latencyMs,
          errorCode: mapped.errorCode,
          createdBy: ctx.userId,
        },
      }),
    );

    return {
      recognitionId: record.id,
      fileId,
      fileKey: file.fileKey,
      fields: {
        waybillNo: mapped.waybillNo,
        phoneTail: mapped.phoneTail,
        courierCode: mapped.courierCode,
      },
      confidence: mapped.confidence,
      status: mapped.status,
      needReview: mapped.needReview,
      reviewFields: mapped.reviewFields,
      warnings: mapped.warnings,
    };
  }

  async recognizeBatch(input: RecognizeBatchInput) {
    const items = [];
    for (const image of input.images) {
      items.push(
        await this.recognize({ stationId: input.stationId, ...image }),
      );
    }
    return { items };
  }

  async confirm(input: ConfirmInput) {
    const recognition = await this.tenantPrisma.withTenant<any>((tx) =>
      tx.ocrRecognition.findUnique({
        where: { id: input.recognitionId },
        include: { parcel: { include: { slot: true } } },
      }),
    );
    if (!recognition) {
      throw new BizError(ApiCode.NOT_FOUND, 'OCR 识别记录不存在');
    }

    if (recognition.parcel) {
      return {
        parcelId: recognition.parcel.id,
        pickupCode: recognition.parcel.pickupCode,
        slotCode: recognition.parcel.slot?.code ?? null,
        slotSource: 'RULE_FALLBACK',
        slotReasons: [],
        status: recognition.parcel.status,
      };
    }

    const result = await this.inbound.inbound({
      stationId: recognition.stationId,
      waybillNo: input.waybillNo,
      carrier: input.courierCode,
      receiverPhone: input.phone,
    });

    await this.tenantPrisma.withTenant((tx) =>
      tx.ocrRecognition.update({
        where: { id: input.recognitionId },
        data: {
          waybillNo: input.waybillNo,
          phoneTail: input.phone.slice(-4),
          courierCode: input.courierCode,
          parcelId: result.parcelId,
          status: 'CONFIRMED',
        },
      }),
    );

    return result;
  }

  private requireTenantContext() {
    const ctx = TenantContext.get();
    if (!ctx?.tenantId) {
      throw new BizError(ApiCode.UNAUTHORIZED, '缺少租户上下文');
    }
    return { ...ctx, tenantId: ctx.tenantId };
  }
}
