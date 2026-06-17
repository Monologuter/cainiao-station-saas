import { http } from './http';
import type { ParcelItem } from './parcel';

export type ExceptionType = 'DAMAGED' | 'MISDELIVERED' | 'UNCLAIMED' | 'REJECTED' | 'OVERSIZED';
export type ExceptionStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
export type ExceptionResolution = 'CONTACT_COURIER' | 'RETURN' | 'RESTOCK' | 'VOID';
export type ExceptionSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ExceptionTicket {
  id: string;
  tenantId: string;
  stationId: string;
  parcelId?: string | null;
  code: string;
  type: ExceptionType;
  status: ExceptionStatus;
  resolution?: ExceptionResolution | null;
  severity?: ExceptionSeverity | null;
  description: string;
  evidenceUrls: string[];
  assigneeId?: string | null;
  parcelStatusBefore?: string | null;
  openedAt: string;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
  createdAt: string;
  updatedAt: string;
  parcel?: Partial<ParcelItem> | null;
  station?: { id: string; name: string; code: string } | null;
}

export interface ExceptionPage {
  list: ExceptionTicket[];
  total: number;
  page: number;
  size: number;
}

export interface ExceptionQuery {
  status?: ExceptionStatus | '';
  type?: ExceptionType | '';
  stationId?: string;
  keyword?: string;
  page?: number;
  size?: number;
}

export interface CreateParcelExceptionPayload {
  type: ExceptionType;
  description: string;
  severity?: ExceptionSeverity;
  evidenceUrls?: string[];
}

export interface ResolveExceptionPayload {
  resolution: ExceptionResolution;
  note?: string;
}

export function toExceptionQueryParams(query: ExceptionQuery) {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== ''),
  );
}

export function createParcelExceptionApi(
  parcelId: string,
  payload: CreateParcelExceptionPayload,
) {
  return http.post<never, ExceptionTicket>(`/parcels/${parcelId}/exception`, payload);
}

export function listExceptionsApi(query: ExceptionQuery) {
  return http.get<never, ExceptionPage>('/exceptions', {
    params: toExceptionQueryParams(query),
  });
}

export function exceptionDetailApi(id: string) {
  return http.get<never, ExceptionTicket>(`/exceptions/${id}`);
}

export function claimExceptionApi(id: string) {
  return http.post<never, ExceptionTicket>(`/exceptions/${id}/claim`);
}

export function resolveExceptionApi(id: string, payload: ResolveExceptionPayload) {
  return http.post<never, ExceptionTicket>(`/exceptions/${id}/resolve`, payload);
}

export function exceptionStatusMeta(status: ExceptionStatus) {
  const metas: Record<ExceptionStatus, { label: string; tag: string }> = {
    OPEN: { label: '待处理', tag: 'amber' },
    IN_PROGRESS: { label: '处理中', tag: 'blue' },
    RESOLVED: { label: '已解决', tag: 'green' },
  };
  return metas[status];
}

export function exceptionTypeMeta(type: ExceptionType) {
  const metas: Record<ExceptionType, { label: string; tag: string }> = {
    DAMAGED: { label: '破损', tag: 'red' },
    MISDELIVERED: { label: '错件', tag: 'amber' },
    UNCLAIMED: { label: '无主件', tag: 'gray' },
    REJECTED: { label: '拒收', tag: 'blue' },
    OVERSIZED: { label: '超大件', tag: 'amber' },
  };
  return metas[type];
}

export function exceptionResolutionMeta(resolution: ExceptionResolution) {
  const metas: Record<ExceptionResolution, { label: string; tag: string }> = {
    CONTACT_COURIER: { label: '联系快递', tag: 'blue' },
    RETURN: { label: '退回', tag: 'red' },
    RESTOCK: { label: '重新入库', tag: 'green' },
    VOID: { label: '作废', tag: 'gray' },
  };
  return metas[resolution];
}
