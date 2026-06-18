import { describe, expect, it } from 'vitest';
import { canSubmitPickup, pickupResultText } from './pickup';

describe('pickup api helpers', () => {
  it('requires station id + at least one of pickup code / phone tail / parcel id', () => {
    // 码或尾号任一 + 门店即可提交
    expect(canSubmitPickup({ stationId: 's1', pickupCode: '1234' })).toBe(true);
    expect(canSubmitPickup({ stationId: 's1', phoneTail: '6688' })).toBe(true);
    expect(canSubmitPickup({ stationId: 's1', parcelId: 'p1' })).toBe(true);
    expect(canSubmitPickup({ stationId: 's1', pickupCode: '1234', phoneTail: '6688' })).toBe(true);
    // 三者全空 / 缺门店 → 不可提交
    expect(canSubmitPickup({ stationId: 's1' })).toBe(false);
    expect(canSubmitPickup({ stationId: 's1', pickupCode: '', phoneTail: '' })).toBe(false);
    expect(canSubmitPickup({ stationId: '', pickupCode: '1234' })).toBe(false);
    expect(canSubmitPickup({ stationId: '', phoneTail: '6688' })).toBe(false);
  });

  it('summarizes successful pickup result', () => {
    expect(pickupResultText({ parcelId: 'p1', status: 'PICKED_UP', slotReleased: true })).toBe(
      '核销成功，库位已释放',
    );
  });
});
