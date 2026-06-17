import { http } from "./http";

export interface AnalyticsOverview {
  inbound?: number;
  pickup?: number;
  stored?: number;
  inboundToday?: number;
  pickedToday?: number;
  inStock?: number;
  pickupRate: number;
  overdueCount: number;
  exceptionCount?: number;
  shipPaid?: number;
  gmv?: number;
  notifyToday?: number;
}

export interface TrendPoint {
  date: string;
  value: number;
}

export interface AnalyticsTrend {
  metric: string;
  points: TrendPoint[];
}

export interface RankingItem {
  key: string;
  label: string;
  value: number;
  extra?: Record<string, unknown>;
}

export interface AnalyticsRanking {
  type: string;
  items: RankingItem[];
}

export interface HeatmapShelf {
  shelfCode: string;
  used: number;
  capacity: number;
  rate: number;
}

export interface AnalyticsHeatmap {
  shelves: HeatmapShelf[];
}

export interface StationCompareRow {
  stationId: string;
  name: string;
  value: number;
}

export interface StationCompare {
  metric: string;
  rows: StationCompareRow[];
}

export interface CreateReportBody {
  type:
    | "daily_summary"
    | "inbound_detail"
    | "pickup_detail"
    | "station_compare";
  format: "csv" | "xlsx";
  from: string;
  to: string;
  stationId?: string;
}

export interface ReportJob {
  id?: string;
  jobId?: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  downloadUrl?: string;
  error?: string | null;
}

export interface DashboardKpi {
  label: string;
  value: string;
  delta: string;
  warn?: boolean;
}

export function toAnalyticsQueryParams(query: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== "" && value !== undefined && value !== null,
    ),
  );
}

export function overviewApi(query: Record<string, unknown> = {}) {
  return http.get<never, AnalyticsOverview>("/analytics/overview", {
    params: toAnalyticsQueryParams(query),
  });
}

export function trendApi(query: {
  metric: string;
  from: string;
  to: string;
  stationId?: string;
}) {
  return http.get<never, AnalyticsTrend>("/analytics/trend", {
    params: toAnalyticsQueryParams(query),
  });
}

export function rankingApi(query: {
  type: "overdue" | "station";
  stationId?: string;
  metric?: string;
  limit?: number;
}) {
  return http.get<never, AnalyticsRanking>("/analytics/ranking", {
    params: toAnalyticsQueryParams(query),
  });
}

export function heatmapApi(query: { stationId?: string }) {
  return http.get<never, AnalyticsHeatmap>("/analytics/heatmap", {
    params: toAnalyticsQueryParams(query),
  });
}

export function stationCompareApi(query: {
  metric: string;
  date?: string;
  limit?: number;
}) {
  return http.get<never, StationCompare>("/analytics/stations/compare", {
    params: toAnalyticsQueryParams(query),
  });
}

export function createAnalyticsReportApi(body: CreateReportBody) {
  return http.post<never, ReportJob>("/analytics/reports", body);
}

export function getAnalyticsReportApi(jobId: string) {
  return http.get<never, ReportJob>(`/analytics/reports/${jobId}`);
}

export function overviewToKpis(overview: AnalyticsOverview): DashboardKpi[] {
  const inbound = overview.inboundToday ?? overview.inbound ?? 0;
  const pickup = overview.pickedToday ?? overview.pickup ?? 0;
  const stored = overview.inStock ?? overview.stored ?? 0;
  const notify = overview.notifyToday ?? 0;
  return [
    { label: "今日入库", value: String(inbound), delta: `通知 ${notify} 次` },
    { label: "今日出库", value: String(pickup), delta: "核销完成" },
    { label: "在库待取", value: String(stored), delta: "当前租户库存" },
    {
      label: "取件率",
      value: `${overview.pickupRate}%`,
      delta: "今日闭环效率",
    },
    {
      label: "滞留预警",
      value: String(overview.overdueCount),
      delta: "超3天待催取",
      warn: overview.overdueCount > 0,
    },
  ];
}
