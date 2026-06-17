import { request } from '@/utils/request';

export type ConsumerParcelStatus = 'PENDING' | 'STORED' | 'PICKED_UP' | 'EXCEPTION' | 'RETURNED';

export interface ConsumerParcel {
  id: string;
  waybillNo: string;
  carrier?: string | null;
  receiverPhoneTail: string;
  pickupCode?: string | null;
  status: ConsumerParcelStatus;
  storedAt?: string | null;
  pickedUpAt?: string | null;
  station?: { id: string; name: string; code: string } | null;
  slot?: { id: string; code: string } | null;
}

export interface ConsumerParcelPage {
  list: ConsumerParcel[];
  total: number;
  page: number;
  size: number;
}

export function formatPickupCode(code?: string | null) {
  if (!code) {
    return '-';
  }
  return /^\d{8}$/.test(code) ? `${code.slice(0, 4)} ${code.slice(4)}` : code;
}

export function statusLabel(status: ConsumerParcelStatus) {
  const labels: Record<ConsumerParcelStatus, string> = {
    PENDING: '待入库',
    STORED: '待取件',
    PICKED_UP: '已取件',
    EXCEPTION: '异常',
    RETURNED: '已退回',
  };
  return labels[status];
}

export function listConsumerParcelsApi(status?: ConsumerParcelStatus | '') {
  const query = status ? `?status=${status}` : '';
  return request<ConsumerParcelPage>({
    url: `/api/consumer/parcels${query}`,
    method: 'GET',
  });
}

export function consumerParcelDetailApi(id: string) {
  return request<ConsumerParcel>({
    url: `/api/consumer/parcels/${id}`,
    method: 'GET',
  });
}
