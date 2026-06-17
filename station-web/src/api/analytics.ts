import { http } from './http';

export interface AnalyticsOverview {
  inboundToday: number;
  pickedToday: number;
  inStock: number;
  pickupRate: number;
  overdueCount: number;
  notifyToday: number;
}

export interface DashboardKpi {
  label: string;
  value: string;
  delta: string;
  warn?: boolean;
}

export function overviewApi() {
  return http.get<never, AnalyticsOverview>('/analytics/overview');
}

export function overviewToKpis(overview: AnalyticsOverview): DashboardKpi[] {
  return [
    { label: '今日入库', value: String(overview.inboundToday), delta: `通知 ${overview.notifyToday} 次` },
    { label: '今日出库', value: String(overview.pickedToday), delta: '核销完成' },
    { label: '在库待取', value: String(overview.inStock), delta: '当前租户库存' },
    { label: '取件率', value: `${overview.pickupRate}%`, delta: '今日闭环效率' },
    {
      label: '滞留预警',
      value: String(overview.overdueCount),
      delta: '超3天待催取',
      warn: overview.overdueCount > 0,
    },
  ];
}
