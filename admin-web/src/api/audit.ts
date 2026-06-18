import { http } from "./http";
import { toAdminAnalyticsQueryParams } from "./analytics";

export interface AuditDiffEntry {
  type: "added" | "changed" | "removed";
  before?: unknown;
  after?: unknown;
}

export interface AuditLog {
  id: string;
  tenantId?: string | null;
  actorId?: string | null;
  actorType: "PLATFORM" | "STAFF" | "SYSTEM";
  actorName?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  result: "SUCCESS" | "FAILURE";
  summary?: string | null;
  diff?: Record<string, AuditDiffEntry> | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
}

export interface AuditListResult {
  total: number;
  page: number;
  pageSize: number;
  items: AuditLog[];
}

export function auditLogsApi(query: Record<string, unknown> = {}) {
  return http.get<never, AuditListResult>("/admin/audit-logs", {
    params: toAdminAnalyticsQueryParams(query),
  });
}

export function auditLogDetailApi(id: string) {
  return http.get<never, AuditLog>(`/admin/audit-logs/${id}`);
}

export function auditActionsApi() {
  return http.get<never, string[]>("/admin/audit-logs/actions");
}
