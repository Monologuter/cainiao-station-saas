import { calcInvoice, calcProration } from './billing-calculator';

describe('calcInvoice', () => {
  const snapshot = {
    monthlyPrice: 9900,
    quotas: { sms: 100, parcels: -1, stations: 1 },
    overagePrices: { sms: 10, parcels: 0, stations: 19900 },
  };

  it('charges only base amount when usage is zero', () => {
    expect(
      calcInvoice(snapshot, { SMS: 0, PARCELS: 0, EXTRA_STATIONS: 0 }),
    ).toEqual({
      baseAmount: 9900,
      overageAmount: 0,
      totalAmount: 9900,
      lineItems: [{ type: 'BASE', amount: 9900 }],
    });
  });

  it('does not charge overage when usage exactly reaches quota', () => {
    expect(calcInvoice(snapshot, { SMS: 100 })).toMatchObject({
      overageAmount: 0,
      totalAmount: 9900,
    });
  });

  it('charges one overage unit when usage exceeds quota by one', () => {
    expect(calcInvoice(snapshot, { SMS: 101 })).toMatchObject({
      overageAmount: 10,
      totalAmount: 9910,
      lineItems: expect.arrayContaining([
        {
          type: 'OVERAGE',
          metric: 'SMS',
          quota: 100,
          used: 101,
          overage: 1,
          unitPrice: 10,
          amount: 10,
        },
      ]),
    });
  });

  it('treats -1 quota as unlimited', () => {
    expect(calcInvoice(snapshot, { PARCELS: 999999 })).toMatchObject({
      overageAmount: 0,
      totalAmount: 9900,
    });
  });

  it('treats zero quota as full overage', () => {
    expect(
      calcInvoice(
        {
          monthlyPrice: 0,
          quotas: { sms: 0 },
          overagePrices: { sms: 8 },
        },
        { SMS: 3 },
      ),
    ).toMatchObject({
      baseAmount: 0,
      overageAmount: 24,
      totalAmount: 24,
    });
  });

  it('charges only exceeded metrics in a mixed invoice', () => {
    expect(
      calcInvoice(
        {
          monthlyPrice: 19900,
          quotas: { sms: 50, parcels: 1000, stations: 1 },
          overagePrices: { sms: 8, parcels: 1, stations: 29900 },
        },
        { SMS: 60, PARCELS: 999, EXTRA_STATIONS: 3 },
      ),
    ).toEqual({
      baseAmount: 19900,
      overageAmount: 59880,
      totalAmount: 79780,
      lineItems: [
        { type: 'BASE', amount: 19900 },
        {
          type: 'OVERAGE',
          metric: 'SMS',
          quota: 50,
          used: 60,
          overage: 10,
          unitPrice: 8,
          amount: 80,
        },
        {
          type: 'OVERAGE',
          metric: 'EXTRA_STATIONS',
          quota: 1,
          used: 3,
          overage: 2,
          unitPrice: 29900,
          amount: 59800,
        },
      ],
    });
  });

  it('calculates large overage in integer cents without floating point drift', () => {
    expect(
      calcInvoice(
        {
          monthlyPrice: 1,
          quotas: { sms: 0 },
          overagePrices: { sms: 7 },
        },
        { SMS: 1_000_001 },
      ),
    ).toMatchObject({
      baseAmount: 1,
      overageAmount: 7_000_007,
      totalAmount: 7_000_008,
    });
  });

  it('rejects non-integer money inputs instead of reaching BigInt RangeError later', () => {
    expect(() =>
      calcInvoice(
        {
          monthlyPrice: 1,
          quotas: { sms: 0 },
          overagePrices: { sms: 0.05 },
        },
        { SMS: 1 },
      ),
    ).toThrow('套餐超额单价必须是整数分');
  });
});

describe('calcProration', () => {
  // 30 天账期：2026-06-01 ~ 2026-07-01，月中 06-16 换套餐 -> 剩余 15 天。
  const periodStart = new Date('2026-06-01T00:00:00.000Z');
  const periodEnd = new Date('2026-07-01T00:00:00.000Z');
  const changeAt = new Date('2026-06-16T00:00:00.000Z');

  it('charges the daily upgrade difference (升档补差) in integer cents', () => {
    const result = calcProration({
      oldMonthlyPrice: 9900,
      newMonthlyPrice: 19900,
      periodStart,
      periodEnd,
      changeAt,
    });

    // periodDays=30, remainingDays=15
    // credit = floor(9900 * 15 / 30) = 4950
    // debit  = floor(19900 * 15 / 30) = 9950
    // net    = 9950 - 4950 = 5000 (正 = 补差)
    expect(result).toMatchObject({
      periodDays: 30,
      remainingDays: 15,
      creditAmount: 4950,
      debitAmount: 9950,
      netAmount: 5000,
    });
    expect(result.lineItems).toEqual([
      expect.objectContaining({ type: 'PRORATION_CREDIT', amount: -4950 }),
      expect.objectContaining({ type: 'PRORATION_DEBIT', amount: 9950 }),
    ]);
    expect(Number.isInteger(result.netAmount)).toBe(true);
  });

  it('produces a negative net (降档抵扣) when moving to a cheaper plan', () => {
    const result = calcProration({
      oldMonthlyPrice: 19900,
      newMonthlyPrice: 9900,
      periodStart,
      periodEnd,
      changeAt,
    });

    // credit = floor(19900*15/30)=9950, debit = floor(9900*15/30)=4950
    // net = 4950 - 9950 = -5000 (负 = 抵扣)
    expect(result.netAmount).toBe(-5000);
    expect(result.lineItems).toEqual([
      expect.objectContaining({ type: 'PRORATION_CREDIT', amount: -9950 }),
      expect.objectContaining({ type: 'PRORATION_DEBIT', amount: 4950 }),
    ]);
  });

  it('rounds remaining days up — 不足一天按一天', () => {
    const result = calcProration({
      oldMonthlyPrice: 0,
      newMonthlyPrice: 3000,
      periodStart,
      periodEnd,
      // 距期末仅 12 小时 -> ceil = 1 天
      changeAt: new Date('2026-06-30T12:00:00.000Z'),
    });
    expect(result.remainingDays).toBe(1);
    expect(result.debitAmount).toBe(Number((BigInt(3000) * BigInt(1)) / BigInt(30)));
  });

  it('uses floor (integer cents, no float drift) on indivisible prices', () => {
    // 31 天账期，剩余 10 天，价格 10000 -> floor(10000*10/31)=3225 (非 3225.8...)
    const result = calcProration({
      oldMonthlyPrice: 0,
      newMonthlyPrice: 10000,
      periodStart: new Date('2026-07-01T00:00:00.000Z'),
      periodEnd: new Date('2026-08-01T00:00:00.000Z'),
      changeAt: new Date('2026-07-22T00:00:00.000Z'),
    });
    expect(result.periodDays).toBe(31);
    expect(result.remainingDays).toBe(10);
    expect(result.debitAmount).toBe(3225);
    expect(Number.isInteger(result.debitAmount)).toBe(true);
  });

  it('returns zero remaining days when changed at/after period end', () => {
    const result = calcProration({
      oldMonthlyPrice: 9900,
      newMonthlyPrice: 19900,
      periodStart,
      periodEnd,
      changeAt: periodEnd,
    });
    expect(result.remainingDays).toBe(0);
    expect(result.creditAmount).toBe(0);
    expect(result.debitAmount).toBe(0);
    expect(result.netAmount).toBe(0);
  });
});
