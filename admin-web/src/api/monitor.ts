import { http } from "./http";
import { toAdminAnalyticsQueryParams } from "./analytics";

export interface MonitorOverview {
  tenants: number;
  stations: number;
  inStockParcels: number;
  exceptionCount: number;
  gmv: number;
}

export interface StoreHealth {
  status: "healthy" | "warning" | "critical";
  reasons: string[];
}

export interface StoreMonitorRow {
  tenantId: string;
  tenantName: string;
  stationId: string;
  stationName: string;
  stationCode: string;
  online: boolean;
  subscription: { id: string; status: string; currentPeriodEnd: string } | null;
  health: StoreHealth;
  metrics: {
    inStockParcels: number;
    exceptionCount: number;
    gmv: number;
  };
}

export interface StoreMonitorList {
  total: number;
  page: number;
  pageSize: number;
  items: StoreMonitorRow[];
}

export function monitorOverviewApi() {
  return http.get<never, MonitorOverview>("/admin/monitor/overview");
}

export function monitorStoresApi(query: Record<string, unknown> = {}) {
  return http.get<never, StoreMonitorList>("/admin/monitor/stores", {
    params: toAdminAnalyticsQueryParams(query),
  });
}

export function monitorStoreDetailApi(stationId: string) {
  return http.get<never, StoreMonitorRow>(`/admin/monitor/stores/${stationId}`);
}
