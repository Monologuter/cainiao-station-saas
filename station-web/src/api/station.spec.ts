import { describe, expect, it } from 'vitest';
import { buildBatchSlotPayload, shelfUsagePercent } from './station';

describe('station api helpers', () => {
  it('builds matrix batch slot payload', () => {
    expect(buildBatchSlotPayload({ rows: 2, levels: 3, cols: 4 })).toEqual({
      rows: 2,
      levels: 3,
      cols: 4,
    });
  });

  it('calculates shelf usage percent from backend ratio or counts', () => {
    expect(shelfUsagePercent({ totalSlots: 10, occupiedSlots: 3, usageRate: 0.3 })).toBe(30);
    expect(shelfUsagePercent({ totalSlots: 4, occupiedSlots: 1 })).toBe(25);
    expect(shelfUsagePercent({ totalSlots: 0, occupiedSlots: 0 })).toBe(0);
  });
});
