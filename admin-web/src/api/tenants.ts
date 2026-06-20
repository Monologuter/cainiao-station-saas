import { http } from "./http";
import { toAdminAnalyticsQueryParams } from "./analytics";

export interface TenantRow {
  id: string;
  name: string;
  ownerName: string;
  contactPhone: string;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  stationCount: number;
  userCount: number;
  createdAt: string;
}

export interface TenantListResult {
  list: TenantRow[];
  total: number;
  page?: number;
  size?: number;
}

export interface CreateTenantInput {
  name: string;
  ownerName: string;
  ownerPhone: string;
  ownerPassword: string;
}

export function tenantsApi(query: {
  status?: string;
  keyword?: string;
  page?: number;
  size?: number;
} = {}) {
  return http.get<never, TenantListResult>("/platform/tenants", {
    params: toAdminAnalyticsQueryParams(query),
  });
}

export function createTenantApi(input: CreateTenantInput) {
  return http.post<never, TenantRow>("/platform/tenants", input);
}

export function updateTenantStatusApi(
  id: string,
  status: TenantRow["status"],
) {
  return http.patch<never, TenantRow>(`/platform/tenants/${id}/status`, {
    status,
  });
}
