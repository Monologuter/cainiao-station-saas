import { ApiCode, BizError } from '../../../core/http/api-code';
import {
  classifyOverdue,
  normalizeOverdueConfig,
  OVERDUE_DEFAULT_CONFIG,
} from './overdue-policy';

const NOW = new Date('2026-06-18T00:00:00.000Z');

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

describe('overdue policy', () => {
  it.each([
    [2, { kind: 'LEVEL', level: 0 }],
    [3, { kind: 'LEVEL', level: 1 }],
    [6, { kind: 'LEVEL', level: 1 }],
    [7, { kind: 'LEVEL', level: 2 }],
    [10, { kind: 'LEVEL', level: 2 }],
    [11, { kind: 'LEVEL', level: 3 }],
    [14, { kind: 'LEVEL', level: 3 }],
    [15, { kind: 'RETURN', level: 3 }],
  ])('classifies %i stored days', (days, expected) => {
    expect(classifyOverdue(daysAgo(days), NOW, OVERDUE_DEFAULT_CONFIG)).toEqual(expected);
  });

  it('uses custom thresholds', () => {
    const config = normalizeOverdueConfig({
      remindDays: 1,
      urgeDays: 2,
      finalDays: 4,
      returnDays: 8,
    });

    expect(classifyOverdue(daysAgo(1), NOW, config)).toEqual({ kind: 'LEVEL', level: 1 });
    expect(classifyOverdue(daysAgo(3), NOW, config)).toEqual({ kind: 'LEVEL', level: 2 });
    expect(classifyOverdue(daysAgo(5), NOW, config)).toEqual({ kind: 'LEVEL', level: 3 });
    expect(classifyOverdue(daysAgo(8), NOW, config)).toEqual({ kind: 'RETURN', level: 3 });
  });

  it('rejects non-increasing thresholds', () => {
    expect(() =>
      normalizeOverdueConfig({
        remindDays: 3,
        urgeDays: 3,
        finalDays: 11,
        returnDays: 15,
      }),
    ).toThrow(BizError);

    try {
      normalizeOverdueConfig({
        remindDays: 3,
        urgeDays: 3,
        finalDays: 11,
        returnDays: 15,
      });
    } catch (error) {
      expect(error).toMatchObject<Partial<BizError>>({
        code: ApiCode.BAD_REQUEST,
      });
    }
  });
});
