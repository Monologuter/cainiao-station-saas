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
  // 取件码 / 手机尾号 / 包裹号至少一项 + 门店即可提交；防空参误发由后端兜底。
  return Boolean(
    payload.stationId &&
      (payload.pickupCode || payload.phoneTail || payload.parcelId),
  );
}

export function pickupResultText(result: PickupResult) {
  return result.slotReleased ? '核销成功，库位已释放' : '核销成功';
}

export function pickupApi(payload: PickupPayload) {
  return http.post<never, PickupResult>('/pickup', payload);
}
