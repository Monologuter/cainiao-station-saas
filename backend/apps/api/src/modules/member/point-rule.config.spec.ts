import {
  checkinPoints,
  levelForTotalPoints,
  pickupPoints,
  POINT_RULES,
  shipPoints,
} from './point-rule.config';

/**
 * FUNC-8c：积分加分规则集中后，三处加分逻辑由本配置统一派生。
 * 这些断言锁定默认值与历史行为一致（pickup=2、ship=floor(amount/100) 且兜底 1、
 * checkin=1+min(连续-1,6)），防止规则被无意改动。
 */
describe('point-rule.config (FUNC-8c)', () => {
  it('exposes the centralized default rule values', () => {
    expect(POINT_RULES.pickup).toBe(2);
    expect(POINT_RULES.ship).toMatchObject({ amountPerPoint: 100, minPoints: 1 });
    expect(POINT_RULES.checkin).toMatchObject({
      basePoints: 1,
      continuousBonusPerDay: 1,
      continuousBonusCap: 6,
    });
  });

  it('pickupPoints returns the fixed pickup reward', () => {
    expect(pickupPoints()).toBe(2);
  });

  it('shipPoints scales by amount and floors to the configured minimum', () => {
    expect(shipPoints(1234)).toBe(12); // floor(1234/100)
    expect(shipPoints(800)).toBe(8);
    expect(shipPoints(50)).toBe(1); // below one point -> min 1
    expect(shipPoints(0)).toBe(1); // never below min
  });

  it('checkinPoints rewards base plus capped continuous bonus', () => {
    expect(checkinPoints(1)).toBe(1); // base only
    expect(checkinPoints(2)).toBe(2);
    expect(checkinPoints(4)).toBe(4); // 1 + min(3,6)
    expect(checkinPoints(7)).toBe(7); // 1 + min(6,6)
    expect(checkinPoints(30)).toBe(7); // bonus capped at 6
  });

  it('still derives member level thresholds', () => {
    expect(levelForTotalPoints(0)).toBe(0);
    expect(levelForTotalPoints(100)).toBe(1);
    expect(levelForTotalPoints(2000)).toBe(3);
  });
});
