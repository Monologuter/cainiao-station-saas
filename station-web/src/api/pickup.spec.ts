import { describe, expect, it } from 'vitest';
import { canSubmitPickup, pickupResultText } from './pickup';

describe('pickup api helpers', () => {
  it('requires station id + pickup code + 4-digit phone tail (dual-factor)', () => {
    expect(canSubmitPickup({ stationId: 's1', pickupCode: '1234', phoneTail: '6688' })).toBe(true);
    // 缺手机尾号 / 缺取件码 / 尾号位数不足 / 缺门店 → 均不可提交
    expect(canSubmitPickup({ stationId: 's1', pickupCode: '1234', phoneTail: '' })).toBe(false);
    expect(canSubmitPickup({ stationId: 's1', pickupCode: '', phoneTail: '6688' })).toBe(false);
    expect(canSubmitPickup({ stationId: 's1', pickupCode: '1234', phoneTail: '66' })).toBe(false);
    expect(canSubmitPickup({ stationId: '', pickupCode: '1234', phoneTail: '6688' })).toBe(false);
  });

  it('summarizes successful pickup result', () => {
    expect(pickupResultText({ parcelId: 'p1', status: 'PICKED_UP', slotReleased: true })).toBe(
      '核销成功，库位已释放',
    );
  });
});
