import { http } from './http';
import type { ParcelItem } from './parcel';

export interface OverdueParcel extends ParcelItem {
  overdueLevel: 1 | 2 | 3;
  daysOverdue: number;
  lastOverdueLevel: number;
}

export interface OverdueParcelPage {
  list: OverdueParcel[];
  total: number;
  page: number;
  size: number;
}

export interface OverdueQuery {
  level?: 1 | 2 | 3 | '';
  page?: number;
  size?: number;
}

export interface OverdueScanResult {
  skipped: boolean;
  scanned: number;
  upgraded: number;
  returned: number;
  levels: Record<1 | 2 | 3, number>;
}

export function toOverdueQueryParams(query: OverdueQuery) {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== ''),
  );
}

export function listOverdueParcelsApi(query: OverdueQuery) {
  return http.get<never, OverdueParcelPage>('/parcels/overdue', {
    params: toOverdueQueryParams(query),
  });
}

export function runOverdueScanApi() {
  return http.post<never, OverdueScanResult>('/parcels/overdue/scan');
}
