export interface PermissionMeta {
  code: string;
  name: string;
  module: string;
}

export const permissionMetas: PermissionMeta[] = [
  { code: 'tenant:create', name: '开店', module: '平台' },
  { code: 'tenant:read', name: '查看租户', module: '平台' },
  { code: 'station:manage', name: '货架库位管理', module: '门店' },
  { code: 'station:read', name: '查看门店货架库位', module: '门店' },
  { code: 'parcel:read', name: '查看包裹', module: '包裹' },
  { code: 'parcel:inbound', name: '扫码入库', module: '包裹' },
  { code: 'parcel:pickup', name: '取件核销', module: '包裹' },
];

const moduleOrder = ['包裹', '门店', '平台'];

export function permissionName(code: string) {
  return permissionMetas.find((item) => item.code === code)?.name ?? code;
}

export function groupPermissions(codes: string[]) {
  return moduleOrder
    .map((module) => ({
      module,
      items: permissionMetas
        .filter((item) => item.module === module && codes.includes(item.code))
        .map(({ code, name }) => ({ code, name })),
    }))
    .filter((group) => group.items.length > 0);
}
