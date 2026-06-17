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
