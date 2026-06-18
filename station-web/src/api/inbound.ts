import { http } from './http';

export interface InboundPayload {
  stationId: string;
  waybillNo: string;
  carrier?: string;
  receiverPhone: string;
}

export interface InboundResult {
  parcelId: string;
  pickupCode: string;
  slotCode: string;
  status: 'STORED';
}

export interface InboundOcrField {
  value: string;
  confidence: number;
}

export interface InboundOcrRecognition {
  recognitionId: string;
  fileId: string;
  fileKey: string;
  provider: string;
  fields: {
    waybillNo?: InboundOcrField;
    courierCode?: InboundOcrField;
    phoneTail?: InboundOcrField;
  };
  confidence: number;
  status: 'SUCCEEDED' | 'NEED_REVIEW' | 'FAILED';
  needReview: boolean;
  reviewFields: string[];
  warnings: string[];
}

export interface ConfirmInboundOcrPayload {
  recognitionId: string;
  waybillNo: string;
  courierCode?: string;
  phone: string;
}

export function inboundApi(payload: InboundPayload) {
  return http.post<never, InboundResult>('/inbound', payload);
}

export function recognizeInboundOcrApi(file: File, stationId: string) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('stationId', stationId);

  return http.post<never, InboundOcrRecognition>('/inbound/ocr/recognize', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export function confirmInboundOcrApi(payload: ConfirmInboundOcrPayload) {
  return http.post<never, InboundResult>('/inbound/ocr/confirm', payload);
}
