import { ApiCode } from '../../core/http/api-code';
import { ExceptionAggregate, ExceptionStatus } from './exception.aggregate';

describe('ExceptionAggregate', () => {
  const legal: Array<[ExceptionStatus, ExceptionStatus]> = [
    ['OPEN', 'IN_PROGRESS'],
    ['IN_PROGRESS', 'RESOLVED'],
  ];

  it.each(legal)('allows %s -> %s', (from, to) => {
    expect(ExceptionAggregate.canTransit(from, to)).toBe(true);
    expect(() => ExceptionAggregate.assertTransit(from, to)).not.toThrow();
  });

  it('rejects jump and repeated transitions', () => {
    expect(() => ExceptionAggregate.assertTransit('OPEN', 'RESOLVED')).toThrow(
      expect.objectContaining({ code: ApiCode.ILLEGAL_TRANSITION }),
    );
    expect(() =>
      ExceptionAggregate.assertTransit('RESOLVED', 'IN_PROGRESS'),
    ).toThrow(expect.objectContaining({ code: ApiCode.ILLEGAL_TRANSITION }));
  });
});
