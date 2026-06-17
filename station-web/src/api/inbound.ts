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

export function inboundApi(payload: InboundPayload) {
  return http.post<never, InboundResult>('/inbound', payload);
}
