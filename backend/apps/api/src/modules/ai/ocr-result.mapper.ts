export type OcrRecognitionStatus = 'RECOGNIZED' | 'LOW_CONFIDENCE' | 'FAILED';

export interface OcrField {
  value?: string | null;
  raw?: string | null;
  confidence?: number;
}

export interface OcrServiceResponse {
  provider: string;
  fields?: {
    waybillNo?: OcrField;
    phoneTail?: OcrField;
    courier?: OcrField;
  };
  overallConfidence: number;
  latencyMs?: number;
  warnings?: string[];
  errorCode?: string;
}

export interface MappedOcrResult {
  provider: string;
  status: OcrRecognitionStatus;
  needReview: boolean;
  reviewFields: string[];
  waybillNo: string | null;
  phoneTail: string | null;
  courierCode: string | null;
  confidence: {
    waybillNo: number;
    phoneTail: number;
    courier: number;
    overall: number;
  };
  latencyMs?: number;
  errorCode?: string;
  warnings: string[];
}

const AUTO_FILL = 0.8;
const NEED_REVIEW = 0.5;

export function mapOcrResult(input: OcrServiceResponse): MappedOcrResult {
  const waybill = input.fields?.waybillNo;
  const phoneTail = input.fields?.phoneTail;
  const courier = input.fields?.courier;
  const confidence = {
    waybillNo: waybill?.confidence ?? 0,
    phoneTail: phoneTail?.confidence ?? 0,
    courier: courier?.confidence ?? 0,
    overall: input.overallConfidence ?? 0,
  };

  if (input.errorCode) {
    return {
      provider: input.provider,
      status: 'FAILED',
      needReview: true,
      reviewFields: ['waybillNo', 'phoneTail', 'courier'],
      waybillNo: null,
      phoneTail: null,
      courierCode: null,
      confidence,
      latencyMs: input.latencyMs,
      errorCode: input.errorCode,
      warnings: input.warnings ?? [],
    };
  }

  const reviewFields = reviewFieldsFor(input);
  const missingWaybill = !waybill?.value || confidence.waybillNo < NEED_REVIEW;
  const lowOverall = confidence.overall < AUTO_FILL;
  const needReview = reviewFields.length > 0 || missingWaybill || lowOverall;

  return {
    provider: input.provider,
    status: needReview ? 'LOW_CONFIDENCE' : 'RECOGNIZED',
    needReview,
    reviewFields,
    waybillNo: waybill?.value ?? null,
    phoneTail: phoneTail?.value ?? null,
    courierCode: courier?.value ?? null,
    confidence,
    latencyMs: input.latencyMs,
    warnings: input.warnings ?? [],
  };
}

function reviewFieldsFor(input: OcrServiceResponse) {
  const fields: string[] = [];
  if ((input.fields?.waybillNo?.confidence ?? 0) < AUTO_FILL) {
    fields.push('waybillNo');
  }
  if ((input.fields?.phoneTail?.confidence ?? 0) < AUTO_FILL) {
    fields.push('phoneTail');
  }
  if ((input.fields?.courier?.confidence ?? 0) < AUTO_FILL) {
    fields.push('courier');
  }
  return fields;
}
