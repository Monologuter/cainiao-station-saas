import { describe, expect, it } from 'vitest';
import {
  checkinRewardLabel,
  couponStatusLabel,
  pointRecordQuery,
  redeemCouponPayload,
  templateQuery,
} from './member';

describe('member api helpers', () => {
  it('builds point record query without empty filters', () => {
    expect(pointRecordQuery({ page: 1, size: 20 })).toBe('?page=1&size=20');
    expect(pointRecordQuery({ type: 'CHECKIN' })).toBe('?type=CHECKIN');
    expect(pointRecordQuery({})).toBe('');
  });

  it('builds coupon template query for tenant and scene', () => {
    expect(templateQuery({ tenantId: 't1', scene: 'SHIP' })).toBe(
      '?tenantId=t1&scene=SHIP',
    );
  });

  it('maps member display states', () => {
    expect(couponStatusLabel('UNUSED')).toBe('可使用');
    expect(couponStatusLabel('USED')).toBe('已使用');
    expect(checkinRewardLabel(3, 3)).toBe('连签 3 天，本次 +3 积分');
  });

  it('creates redeem payload from template id', () => {
    expect(redeemCouponPayload('tpl-1')).toEqual({ templateId: 'tpl-1' });
  });
});
