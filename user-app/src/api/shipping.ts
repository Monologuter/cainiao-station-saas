import { request } from '@/utils/request';

export type ShipOrderStatus =
  | 'CREATED'
  | 'PAID'
  | 'COLLECTED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED';

export interface ShippingAddress {
  name: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  address: string;
}

export interface ShippingQuotePayload {
  stationId: string;
  sender: ShippingAddress;
  receiver: ShippingAddress;
  weightGram: number;
  preference?: 'balanced' | 'priceFirst' | 'speedFirst';
}

export interface ShippingQuote {
  courierCode: string;
  courierName: string;
  zone: string;
  amount: number;
  estHours: number;
  recommended: boolean;
}

export interface CreateShipOrderPayload {
  stationId: string;
  courierCode: string;
  sender: ShippingAddress;
  receiver: ShippingAddress;
  item: {
    type: string;
    weightGram: number;
    declaredValue?: number;
  };
}

export interface ShipOrder {
  id: string;
  tenantId: string;
  stationId?: string | null;
  orderNo: string;
  channel: 'STATION' | 'ONLINE';
  status: ShipOrderStatus;
  senderJson: ShippingAddress;
  receiverJson: ShippingAddress;
  itemJson: CreateShipOrderPayload['item'];
  weightGram: number;
  courierCode: string;
  courierName: string;
  quoteAmount: number;
  consumerId?: string | null;
  waybillNo?: string | null;
  paidAt?: string | null;
  collectedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipOrderPage {
  list: ShipOrder[];
  total: number;
  page: number;
  size: number;
}

export interface ShipOrderQuery {
  status?: ShipOrderStatus | '';
  page?: number;
  size?: number;
}

export interface LogisticsTrack {
  id: string;
  seq: number;
  nodeStatus: string;
  location: string;
  description: string;
  happenedAt: string;
}

export function shippingStatusLabel(status: ShipOrderStatus) {
  const labels: Record<ShipOrderStatus, string> = {
    CREATED: '待支付',
    PAID: '待揽收',
    COLLECTED: '已揽收',
    IN_TRANSIT: '运输中',
    DELIVERED: '已签收',
    CANCELLED: '已取消',
  };
  return labels[status];
}

export function shippingStatusTag(status: ShipOrderStatus) {
  const tags: Record<ShipOrderStatus, string> = {
    CREATED: 'amber',
    PAID: 'blue',
    COLLECTED: 'purple',
    IN_TRANSIT: 'blue',
    DELIVERED: 'green',
    CANCELLED: 'gray',
  };
  return tags[status];
}

export function toShipOrderQuery(query: ShipOrderQuery) {
  const params = new URLSearchParams();
  if (query.status) {
    params.set('status', query.status);
  }
  if (query.page !== undefined) {
    params.set('page', String(query.page));
  }
  if (query.size !== undefined) {
    params.set('size', String(query.size));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function makeShipPayKey(orderId: string) {
  return `csp-${orderId}-${Date.now().toString(36)}`;
}

export function quoteShippingApi(payload: ShippingQuotePayload) {
  return request<ShippingQuote[]>({
    url: '/api/shipping/consumer/quote',
    method: 'POST',
    data: payload,
  });
}

export function createShipOrderApi(payload: CreateShipOrderPayload) {
  return request<ShipOrder>({
    url: '/api/shipping/consumer/orders',
    method: 'POST',
    data: {
      ...payload,
      channel: 'ONLINE',
    },
  });
}

export function payShipOrderApi(id: string) {
  return request<ShipOrder>({
    url: `/api/shipping/consumer/orders/${id}/pay`,
    method: 'POST',
    header: {
      'Idempotency-Key': makeShipPayKey(id),
    },
  });
}

export function listMyShipOrdersApi(query: ShipOrderQuery = {}) {
  return request<ShipOrderPage>({
    url: `/api/shipping/my-orders${toShipOrderQuery(query)}`,
    method: 'GET',
  });
}

export function shipOrderDetailApi(id: string) {
  return request<ShipOrder>({
    url: `/api/shipping/consumer/orders/${id}`,
    method: 'GET',
  });
}

export function shipOrderTracksApi(id: string) {
  return request<LogisticsTrack[]>({
    url: `/api/shipping/consumer/orders/${id}/tracks`,
    method: 'GET',
  });
}
