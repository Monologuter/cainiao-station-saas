import type { Component } from "vue";

/**
 * 路由组件统一使用动态 import 实现懒加载（代码分割）。
 * vue-router 接受 `() => import(...)` 形式的异步组件加载器作为 component。
 */
export type RouteComponentLoader = () => Promise<{ default: Component }>;

export interface StationRouteDef {
  code: string;
  name: string;
  path: string;
  title: string;
  perm?: string | string[];
  component: RouteComponentLoader;
}

export const stationRouteDefs: StationRouteDef[] = [
  {
    code: "workbench",
    name: "Workbench",
    path: "workbench",
    title: "工作台",
    component: () => import("@/views/WorkbenchView.vue"),
  },
  {
    code: "inbound",
    name: "Inbound",
    path: "inbound",
    title: "扫码入库",
    perm: "parcel:inbound",
    component: () => import("@/views/InboundView.vue"),
  },
  {
    code: "parcels",
    name: "Parcels",
    path: "parcels",
    title: "在库包裹",
    perm: "parcel:read",
    component: () => import("@/views/ParcelsView.vue"),
  },
  {
    code: "pickup",
    name: "Pickup",
    path: "pickup",
    title: "取件核销",
    perm: "parcel:pickup",
    component: () => import("@/views/PickupView.vue"),
  },
  {
    code: "exceptions",
    name: "Exceptions",
    path: "exceptions",
    title: "异常件",
    perm: "exception:read",
    component: () => import("@/views/ExceptionsView.vue"),
  },
  {
    code: "reviews",
    name: "Reviews",
    path: "reviews",
    title: "评价管理",
    perm: "review:read",
    component: () => import("@/views/ReviewsView.vue"),
  },
  {
    code: "complaints",
    name: "Complaints",
    path: "complaints",
    title: "投诉处理",
    perm: "complaint:read",
    component: () => import("@/views/ComplaintsView.vue"),
  },
  {
    code: "shelves",
    name: "Shelves",
    path: "shelves",
    title: "货架库位",
    perm: "station:manage",
    component: () => import("@/views/ShelvesView.vue"),
  },
  {
    code: "staff-roles",
    name: "StaffRoles",
    path: "staff-roles",
    title: "员工权限",
    perm: "station:manage",
    component: () => import("@/views/StaffRolesView.vue"),
  },
  {
    code: "settings",
    name: "Settings",
    path: "settings",
    title: "门店设置",
    perm: "station:manage",
    component: () => import("@/views/SettingsView.vue"),
  },
  {
    code: "billing-settings",
    name: "BillingSettings",
    path: "billing",
    title: "订阅账单",
    perm: ["subscription:read", "invoice:read"],
    component: () => import("@/views/BillingSettingsView.vue"),
  },
  {
    code: "shipping",
    name: "Shipping",
    path: "shipping",
    title: "寄件管理",
    perm: "shipping:read",
    component: () => import("@/views/ShippingView.vue"),
  },
  {
    code: "coupons",
    name: "Coupons",
    path: "coupons",
    title: "优惠券",
    perm: "coupon:manage",
    component: () => import("@/views/CouponsView.vue"),
  },
  {
    code: "statistics",
    name: "Statistics",
    path: "statistics",
    title: "经营统计",
    perm: "analytics:read",
    component: () => import("@/views/StatisticsView.vue"),
  },
];

export function availableRoutes(perms: string[]) {
  return stationRouteDefs.filter(
    (route) =>
      !route.perm ||
      (Array.isArray(route.perm)
        ? route.perm.every((perm) => perms.includes(perm))
        : perms.includes(route.perm)),
  );
}
