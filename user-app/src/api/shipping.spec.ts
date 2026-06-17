import { describe, expect, it } from 'vitest';
import { makeShipPayKey, shippingStatusLabel, toShipOrderQuery } from './shipping';

describe('consumer shipping helpers', () => {
  it('maps shipping statuses for mobile display', () => {
    expect(shippingStatusLabel('CREATED')).toBe('待支付');
    expect(shippingStatusLabel('PAID')).toBe('待揽收');
    expect(shippingStatusLabel('DELIVERED')).toBe('已签收');
  });

  it('builds my-orders query without empty filters', () => {
    expect(toShipOrderQuery({ status: '', page: 1, size: 20 })).toBe('?page=1&size=20');
    expect(toShipOrderQuery({ status: 'PAID' })).toBe('?status=PAID');
    expect(toShipOrderQuery({})).toBe('');
  });

  it('creates payment idempotency keys per shipping order', () => {
    const key = makeShipPayKey('38b758f3-1906-43cd-bf19-48c1622b1760');

    expect(key).toMatch(/^csp-38b758f3-1906-43cd-bf19-48c1622b1760-/);
    expect(key.length).toBeLessThanOrEqual(64);
  });
});
