import { describe, expect, it } from 'vitest';
import {
  shippingStatusMeta,
  toShippingQueryParams,
  makeShippingPayKey,
} from './shipping';

describe('shipping api mapping', () => {
  it('drops empty filters and keeps backend query keys', () => {
    expect(
      toShippingQueryParams({
        status: 'PAID',
        stationId: '',
        page: 2,
        size: 20,
      }),
    ).toEqual({
      status: 'PAID',
      page: 2,
      size: 20,
    });
  });

  it('maps shipping status to stable tag semantics', () => {
    expect(shippingStatusMeta('CREATED')).toEqual({ label: '待支付', tag: 'gray' });
    expect(shippingStatusMeta('PAID')).toEqual({ label: '待揽收', tag: 'blue' });
    expect(shippingStatusMeta('DELIVERED')).toEqual({ label: '已签收', tag: 'green' });
  });

  it('builds stable payment idempotency keys per order', () => {
    expect(makeShippingPayKey('so1')).toMatch(/^ship-pay-so1-/);
  });
});
