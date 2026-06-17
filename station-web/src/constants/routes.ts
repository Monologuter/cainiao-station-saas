import type { Component } from 'vue';
import InboundView from '@/views/InboundView.vue';
import ParcelsView from '@/views/ParcelsView.vue';
import PickupView from '@/views/PickupView.vue';
import ShelvesView from '@/views/ShelvesView.vue';
import SettingsView from '@/views/SettingsView.vue';
import ShippingView from '@/views/ShippingView.vue';
import StaffRolesView from '@/views/StaffRolesView.vue';
import WorkbenchView from '@/views/WorkbenchView.vue';
import PlaceholderView from '@/views/PlaceholderView.vue';

export interface StationRouteDef {
  code: string;
  name: string;
  path: string;
  title: string;
  perm?: string;
  component: Component;
}

export const stationRouteDefs: StationRouteDef[] = [
  {
    code: 'workbench',
    name: 'Workbench',
    path: 'workbench',
    title: '工作台',
    component: WorkbenchView,
  },
  {
    code: 'inbound',
    name: 'Inbound',
    path: 'inbound',
    title: '扫码入库',
    perm: 'parcel:inbound',
    component: InboundView,
  },
  {
    code: 'parcels',
    name: 'Parcels',
    path: 'parcels',
    title: '在库包裹',
    perm: 'parcel:read',
    component: ParcelsView,
  },
  {
    code: 'pickup',
    name: 'Pickup',
    path: 'pickup',
    title: '取件核销',
    perm: 'parcel:pickup',
    component: PickupView,
  },
  {
    code: 'shelves',
    name: 'Shelves',
    path: 'shelves',
    title: '货架库位',
    perm: 'station:manage',
    component: ShelvesView,
  },
  {
    code: 'staff-roles',
    name: 'StaffRoles',
    path: 'staff-roles',
    title: '员工权限',
    perm: 'station:manage',
    component: StaffRolesView,
  },
  {
    code: 'settings',
    name: 'Settings',
    path: 'settings',
    title: '门店设置',
    perm: 'station:manage',
    component: SettingsView,
  },
  {
    code: 'shipping',
    name: 'Shipping',
    path: 'shipping',
    title: '寄件管理',
    perm: 'shipping:read',
    component: ShippingView,
  },
  {
    code: 'statistics',
    name: 'Statistics',
    path: 'statistics',
    title: '经营统计',
    component: PlaceholderView,
  },
];

export function availableRoutes(perms: string[]) {
  return stationRouteDefs.filter((route) => !route.perm || perms.includes(route.perm));
}
