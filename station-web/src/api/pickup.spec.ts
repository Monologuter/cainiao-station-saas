import { describe, expect, it } from 'vitest';
import { canSubmitPickup, pickupResultText } from './pickup';

describe('pickup api helpers', () => {
  it('allows pickup by code or phone tail with a station id', () => {
    expect(canSubmitPickup({ stationId: 's1', pickupCode: '1234', phoneTail: '' })).toBe(true);
    expect(canSubmitPickup({ stationId: 's1', pickupCode: '', phoneTail: '5678' })).toBe(true);
    expect(canSubmitPickup({ stationId: 's1', pickupCode: '', phoneTail: '' })).toBe(false);
    expect(canSubmitPickup({ stationId: '', pickupCode: '1234', phoneTail: '' })).toBe(false);
  });

  it('summarizes successful pickup result', () => {
    expect(pickupResultText({ parcelId: 'p1', status: 'PICKED_UP', slotReleased: true })).toBe(
      '核销成功，库位已释放',
    );
  });
});
