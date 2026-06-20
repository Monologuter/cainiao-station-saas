import { http } from './http';

export type ParcelStatus = 'PENDING' | 'STORED' | 'PICKED_UP' | 'EXCEPTION' | 'RETURNED';

export interface ParcelQuery {
  status?: ParcelStatus | '';
  phoneTail?: string;
  pickupCode?: string;
  waybillNo?: string;
  slot?: string;
  page?: number;
  size?: number;
}

export interface ParcelStation {
  id: string;
  name: string;
  code: string;
}

export interface ParcelSlot {
  id: string;
  code: string;
}

export interface ParcelEvent {
  id: string;
  fromStatus: ParcelStatus | null;
  toStatus: ParcelStatus;
  eventType: string;
  operatorId: string | null;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface ParcelItem {
  id: string;
  tenantId: string;
  stationId: string;
  waybillNo: string;
  carrier?: string | null;
  receiverPhoneTail: string;
  pickupCode?: string | null;
  status: ParcelStatus;
  storedAt?: string | null;
  pickedUpAt?: string | null;
  createdAt: string;
  updatedAt: string;
  station?: ParcelStation | null;
  slot?: ParcelSlot | null;
  events?: ParcelEvent[];
}

export interface ParcelPage {
  list: ParcelItem[];
  total: number;
  page: number;
  size: number;
}

export function toParcelQueryParams(query: ParcelQuery) {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== ''),
  );
}

export function listParcelsApi(query: ParcelQuery) {
  return http.get<never, ParcelPage>('/parcels', {
    params: toParcelQueryParams(query),
  });
}

export function parcelDetailApi(id: string) {
  return http.get<never, ParcelItem>(`/parcels/${id}`);
}

export function parcelStatusMeta(status: ParcelStatus) {
  const metas: Record<ParcelStatus, { label: string; tag: string }> = {
    PENDING: { label: '待入库', tag: 'gray' },
    STORED: { label: '在库待取', tag: 'blue' },
    PICKED_UP: { label: '已取件', tag: 'green' },
    EXCEPTION: { label: '异常', tag: 'amber' },
    RETURNED: { label: '已退回', tag: 'red' },
  };
  return metas[status];
}

export function eventTypeLabel(eventType: string) {
  const labels: Record<string, string> = {
    INBOUND: '创建到件',
    STORED: '入库上架',
    PICKED_UP: '取件核销',
    EXCEPTION: '标记异常',
    RETURNED: '退回处理',
  };
  return labels[eventType] ?? '操作记录';
}
