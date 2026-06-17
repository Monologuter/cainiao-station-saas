import { describe, expect, it, vi } from 'vitest';
import { http } from './http';
import {
  couponSceneMeta,
  createCouponTemplateApi,
  issueCouponsApi,
  listCouponTemplatesApi,
  toCouponTemplateQueryParams,
} from './coupon';

describe('coupon api mapping', () => {
  it('drops empty template filters', () => {
    expect(toCouponTemplateQueryParams({ scene: 'ALL', status: '', page: 1 })).toEqual({
      scene: 'ALL',
      page: 1,
    });
  });

  it('maps coupon management endpoints', async () => {
    const get = vi.spyOn(http, 'get').mockResolvedValue({ list: [], total: 0 });
    const post = vi.spyOn(http, 'post').mockResolvedValue({ id: 'tpl1' });

    await listCouponTemplatesApi({ scene: 'SHIP' });
    await createCouponTemplateApi({
      name: '寄件券',
      type: 'DISCOUNT',
      faceValue: 3,
      threshold: 10,
      scene: 'SHIP',
      costPoints: 30,
      validDays: 7,
    });
    await issueCouponsApi('tpl1', ['m1']);

    expect(get).toHaveBeenCalledWith('/admin/coupon-templates', {
      params: { scene: 'SHIP' },
    });
    expect(post).toHaveBeenCalledWith('/admin/coupon-templates', {
      name: '寄件券',
      type: 'DISCOUNT',
      faceValue: 3,
      threshold: 10,
      scene: 'SHIP',
      costPoints: 30,
      validDays: 7,
    });
    expect(post).toHaveBeenCalledWith('/admin/coupon-templates/tpl1/issue', {
      memberIds: ['m1'],
    });
  });

  it('maps coupon scenes', () => {
    expect(couponSceneMeta('ALL')).toEqual({ label: '全场景', tag: 'blue' });
    expect(couponSceneMeta('SHIP')).toEqual({ label: '寄件', tag: 'green' });
  });
});
