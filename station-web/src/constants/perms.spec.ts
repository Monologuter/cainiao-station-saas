import { describe, expect, it } from 'vitest';
import { groupPermissions } from './perms';

describe('permission metadata', () => {
  it('groups backend permission codes for staff roles page', () => {
    const groups = groupPermissions([
      'parcel:read',
      'parcel:pickup',
      'parcel:overdue:scan',
      'exception:create',
      'exception:read',
      'station:manage',
      'shipping:read',
    ]);

    expect(groups).toEqual([
      {
        module: '包裹',
        items: [
          { code: 'parcel:read', name: '查看包裹' },
          { code: 'parcel:pickup', name: '取件核销' },
          { code: 'parcel:overdue:scan', name: '手动滞留扫描' },
        ],
      },
      {
        module: '异常',
        items: [
          { code: 'exception:create', name: '标记异常件' },
          { code: 'exception:read', name: '查看异常件' },
        ],
      },
      {
        module: '门店',
        items: [{ code: 'station:manage', name: '货架库位管理' }],
      },
      {
        module: '寄件',
        items: [{ code: 'shipping:read', name: '查看寄件单' }],
      },
    ]);
  });
});
