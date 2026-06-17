import { calcInvoice } from './billing-calculator';

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
});
