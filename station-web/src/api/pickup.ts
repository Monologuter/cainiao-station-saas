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
  // 双因子核销：取件码 + 手机尾号(4位)均必填，防止仅凭取件码冒领
  return Boolean(
    payload.stationId &&
      payload.pickupCode &&
      payload.phoneTail &&
      payload.phoneTail.length === 4,
  );
}

export function pickupResultText(result: PickupResult) {
  return result.slotReleased ? '核销成功，库位已释放' : '核销成功';
}

export function pickupApi(payload: PickupPayload) {
  return http.post<never, PickupResult>('/pickup', payload);
}
