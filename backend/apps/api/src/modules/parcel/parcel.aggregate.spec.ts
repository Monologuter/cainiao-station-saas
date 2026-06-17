import { ApiCode } from '../../core/http/api-code';
import { ParcelAggregate, ParcelStatus } from './parcel.aggregate';

describe('ParcelAggregate', () => {
  const legal: Array<[ParcelStatus, ParcelStatus]> = [
    ['PENDING', 'STORED'],
    ['PENDING', 'EXCEPTION'],
    ['STORED', 'PICKED_UP'],
    ['STORED', 'EXCEPTION'],
    ['STORED', 'RETURNED'],
    ['EXCEPTION', 'STORED'],
    ['EXCEPTION', 'RETURNED'],
  ];

  it.each(legal)('allows %s -> %s', (from, to) => {
    expect(ParcelAggregate.canTransit(from, to)).toBe(true);
    expect(() => ParcelAggregate.assertTransit(from, to)).not.toThrow();
  });

  it('rejects illegal transitions with business error', () => {
    const all: ParcelStatus[] = [
      'PENDING',
      'STORED',
      'PICKED_UP',
      'EXCEPTION',
      'RETURNED',
    ];

    for (const from of all) {
      for (const to of all) {
        if (from === to || legal.some(([f, t]) => f === from && t === to)) {
          continue;
        }

        expect(ParcelAggregate.canTransit(from, to)).toBe(false);
        expect(() => ParcelAggregate.assertTransit(from, to)).toThrow(
          expect.objectContaining({ code: ApiCode.ILLEGAL_TRANSITION }),
        );
      }
    }
  });
});
