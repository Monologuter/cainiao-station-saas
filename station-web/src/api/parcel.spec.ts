import { describe, expect, it } from 'vitest';
import { parcelStatusMeta, toParcelQueryParams } from './parcel';

describe('parcel api mapping', () => {
  it('drops empty filters and keeps backend query keys', () => {
    expect(
      toParcelQueryParams({
        status: 'STORED',
        phoneTail: '',
        pickupCode: '1024',
        slot: 'A-01-01-01',
        page: 2,
        size: 20,
      }),
    ).toEqual({
      status: 'STORED',
      pickupCode: '1024',
      slot: 'A-01-01-01',
      page: 2,
      size: 20,
    });
  });

  it('maps parcel status to kit tag semantics', () => {
    expect(parcelStatusMeta('STORED')).toEqual({ label: '在库待取', tag: 'blue' });
    expect(parcelStatusMeta('PICKED_UP')).toEqual({ label: '已取件', tag: 'green' });
    expect(parcelStatusMeta('EXCEPTION')).toEqual({ label: '异常', tag: 'amber' });
  });
});
