import { describe, expect, it } from 'vitest';
import { overviewToKpis } from './analytics';

describe('analytics overview mapping', () => {
  it('maps backend overview to dashboard kpis', () => {
    expect(
      overviewToKpis({
        inboundToday: 12,
        pickedToday: 9,
        inStock: 32,
        pickupRate: 75,
        overdueCount: 2,
        notifyToday: 24,
      }).map((item) => [item.label, item.value]),
    ).toEqual([
      ['今日入库', '12'],
      ['今日出库', '9'],
      ['在库待取', '32'],
      ['取件率', '75%'],
      ['滞留预警', '2'],
    ]);
  });
});
