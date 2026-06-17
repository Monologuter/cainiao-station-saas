import { ApiCode } from '../../core/http/api-code';
import { ShipOrderAggregate, ShipOrderStatus } from './ship-order.aggregate';

describe('ShipOrderAggregate', () => {
  const legal: Array<[ShipOrderStatus, ShipOrderStatus]> = [
    ['CREATED', 'PAID'],
    ['PAID', 'COLLECTED'],
    ['COLLECTED', 'IN_TRANSIT'],
    ['IN_TRANSIT', 'DELIVERED'],
    ['CREATED', 'CANCELLED'],
    ['PAID', 'CANCELLED'],
  ];

  it.each(legal)('allows %s -> %s', (from, to) => {
    expect(ShipOrderAggregate.canTransit(from, to)).toBe(true);
    expect(() => ShipOrderAggregate.assertTransit(from, to)).not.toThrow();
  });

  it('rejects every unsupported transition with a shipping business error', () => {
    const all: ShipOrderStatus[] = [
      'CREATED',
      'PAID',
      'COLLECTED',
      'IN_TRANSIT',
      'DELIVERED',
      'CANCELLED',
    ];

    for (const from of all) {
      for (const to of all) {
        if (from === to || legal.some(([f, t]) => f === from && t === to)) {
          continue;
        }

        expect(ShipOrderAggregate.canTransit(from, to)).toBe(false);
        expect(() => ShipOrderAggregate.assertTransit(from, to)).toThrow(
          expect.objectContaining({
            code: ApiCode.SHIPPING_ILLEGAL_TRANSITION,
          }),
        );
      }
    }
  });
});
