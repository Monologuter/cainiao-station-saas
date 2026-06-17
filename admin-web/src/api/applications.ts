import { http } from "./http";
import { toAdminAnalyticsQueryParams } from "./analytics";

export interface QualificationFile {
  type: string;
  fileKey: string;
  fileName: string;
  downloadUrl?: string;
}

export interface TenantApplication {
  id: string;
  applicationNo: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  entityType: "INDIVIDUAL" | "COMPANY";
  entityName: string;
  unifiedCreditCode?: string | null;
  regionCode: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string | null;
  stationName: string;
  stationAddress: string;
  proposedPlanCode?: string | null;
  qualifications: QualificationFile[];
  rejectReason?: string | null;
  approvedTenantId?: string | null;
  createdAt: string;
}

export interface ApplicationListResult {
  total: number;
  page: number;
  pageSize: number;
  items: TenantApplication[];
}

export function applicationsApi(query: Record<string, unknown> = {}) {
  return http.get<never, ApplicationListResult>("/admin/applications", {
    params: toAdminAnalyticsQueryParams(query),
  });
}

export function applicationDetailApi(id: string) {
  return http.get<never, TenantApplication>(`/admin/applications/${id}`);
}

export function approveApplicationApi(
  id: string,
  input: { planCode?: string; stationName?: string },
) {
  return http.post<never, { tenantId: string; ownerUsername: string }>(
    `/admin/applications/${id}/approve`,
    input,
  );
}

export function rejectApplicationApi(id: string, rejectReason: string) {
  return http.post<never, void>(`/admin/applications/${id}/reject`, {
    rejectReason,
  });
}
