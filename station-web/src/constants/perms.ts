export interface PermissionMeta {
  code: string;
  name: string;
  module: string;
}

export const permissionMetas: PermissionMeta[] = [
  { code: "tenant:create", name: "开店", module: "平台" },
  { code: "tenant:read", name: "查看租户", module: "平台" },
  { code: "station:manage", name: "货架库位管理", module: "门店" },
  { code: "station:read", name: "查看门店货架库位", module: "门店" },
  { code: "parcel:read", name: "查看包裹", module: "包裹" },
  { code: "parcel:inbound", name: "扫码入库", module: "包裹" },
  { code: "parcel:pickup", name: "取件核销", module: "包裹" },
  { code: "parcel:overdue:scan", name: "手动滞留扫描", module: "包裹" },
  { code: "exception:create", name: "标记异常件", module: "异常" },
  { code: "exception:read", name: "查看异常件", module: "异常" },
  { code: "exception:handle", name: "处理异常件", module: "异常" },
  { code: "shipping:quote", name: "寄件报价", module: "寄件" },
  { code: "shipping:create", name: "创建寄件单", module: "寄件" },
  { code: "shipping:read", name: "查看寄件单", module: "寄件" },
  { code: "shipping:pay", name: "寄件支付", module: "寄件" },
  { code: "shipping:collect", name: "寄件揽收", module: "寄件" },
  { code: "shipping:cancel", name: "取消寄件单", module: "寄件" },
  { code: "analytics:read", name: "查看运营大屏", module: "统计" },
  { code: "analytics:export", name: "导出运营报表", module: "统计" },
  { code: "analytics:reconcile", name: "手动对账重算", module: "统计" },
  { code: "plan:read", name: "查看套餐", module: "订阅" },
  { code: "subscription:read", name: "查看订阅", module: "订阅" },
  { code: "subscription:write", name: "管理订阅", module: "订阅" },
  { code: "usage:read", name: "查看用量", module: "订阅" },
  { code: "invoice:read", name: "查看账单", module: "订阅" },
  { code: "invoice:pay", name: "支付账单", module: "订阅" },
  { code: "coupon:manage", name: "管理优惠券", module: "会员" },
  { code: "coupon:issue", name: "发放优惠券", module: "会员" },
  { code: "review:read", name: "查看评价", module: "评价" },
  { code: "review:reply", name: "回复评价", module: "评价" },
  { code: "review:manage", name: "管理评价", module: "评价" },
  { code: "complaint:read", name: "查看投诉", module: "评价" },
  { code: "complaint:handle", name: "处理投诉", module: "评价" },
];

const moduleOrder = [
  "包裹",
  "异常",
  "门店",
  "寄件",
  "统计",
  "订阅",
  "会员",
  "评价",
  "平台",
];

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
