import { describe, expect, it } from 'vitest';
import { groupPermissions } from './perms';

describe('permission metadata', () => {
  it('groups backend permission codes for staff roles page', () => {
    const groups = groupPermissions(['parcel:read', 'parcel:pickup', 'station:manage']);

    expect(groups).toEqual([
      {
        module: '包裹',
        items: [
          { code: 'parcel:read', name: '查看包裹' },
          { code: 'parcel:pickup', name: '取件核销' },
        ],
      },
      {
        module: '门店',
        items: [{ code: 'station:manage', name: '货架库位管理' }],
      },
    ]);
  });
});
