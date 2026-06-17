import { http } from './http';

export interface PickupPayload {
  stationId: string;
  pickupCode?: string;
  phoneTail?: string;
  parcelId?: string;
}

export interface PickupResult {
  parcelId: string;
  status: 'PICKED_UP';
  slotReleased: boolean;
}

export function canSubmitPickup(payload: PickupPayload) {
  return Boolean(payload.stationId && (payload.pickupCode || payload.phoneTail || payload.parcelId));
}

export function pickupResultText(result: PickupResult) {
  return result.slotReleased ? '核销成功，库位已释放' : '核销成功';
}

export function pickupApi(payload: PickupPayload) {
  return http.post<never, PickupResult>('/pickup', payload);
}
