import { http } from "./http";

export interface PlatformOverview {
  tenants: number;
  stations: number;
  parcels: number;
  inbound?: number;
  pickup?: number;
  shipPaid?: number;
  gmv: number;
}

export interface TenantCompareRow {
  tenantId: string;
  name: string;
  value: number;
}

export interface TenantCompare {
  metric: string;
  rows: TenantCompareRow[];
}

export function toAdminAnalyticsQueryParams(query: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== "" && value !== undefined && value !== null,
    ),
  );
}

export function platformOverviewApi(query: { date?: string } = {}) {
  return http.get<never, PlatformOverview>("/admin/analytics/overview", {
    params: toAdminAnalyticsQueryParams(query),
  });
}

export function tenantCompareApi(query: {
  metric: string;
  date?: string;
  limit?: number;
}) {
  return http.get<never, TenantCompare>("/admin/analytics/tenants/compare", {
    params: toAdminAnalyticsQueryParams(query),
  });
}
