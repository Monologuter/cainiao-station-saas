import { http } from './http';

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

export interface ShippingItem {
  type: string;
  weightGram: number;
  declaredValue?: number;
}

export interface ShippingQuotePayload {
  stationId?: string;
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
  breakdown: {
    firstPrice: number;
    addWeightUnits: number;
    addPrice: number;
    subtotal: number;
    zoneFactor: number;
    total: number;
  };
}

export interface CreateShipOrderPayload {
  channel: 'STATION' | 'ONLINE';
  stationId?: string;
  courierCode: string;
  sender: ShippingAddress;
  receiver: ShippingAddress;
  item: ShippingItem;
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
  itemJson: ShippingItem;
  weightGram: number;
  courierCode: string;
  courierName: string;
  quoteAmount: number;
  quoteSnapshotJson: Record<string, unknown>;
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

export interface ShippingQuery {
  status?: ShipOrderStatus | '';
  stationId?: string;
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

export function toShippingQueryParams(query: ShippingQuery) {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== ''),
  );
}

export function makeShippingPayKey(orderId: string) {
  return `ship-pay-${orderId}-${Date.now()}`;
}

export function shippingStatusMeta(status: ShipOrderStatus) {
  const metas: Record<ShipOrderStatus, { label: string; tag: string }> = {
    CREATED: { label: '待支付', tag: 'gray' },
    PAID: { label: '待揽收', tag: 'blue' },
    COLLECTED: { label: '已揽收', tag: 'amber' },
    IN_TRANSIT: { label: '运输中', tag: 'blue' },
    DELIVERED: { label: '已签收', tag: 'green' },
    CANCELLED: { label: '已取消', tag: 'red' },
  };
  return metas[status];
}

export function quoteShippingApi(payload: ShippingQuotePayload) {
  return http.post<never, ShippingQuote[]>('/shipping/quote', payload);
}

export function createShipOrderApi(payload: CreateShipOrderPayload) {
  return http.post<never, ShipOrder>('/shipping/orders', payload);
}

export function listShipOrdersApi(query: ShippingQuery) {
  return http.get<never, ShipOrderPage>('/shipping/orders', {
    params: toShippingQueryParams(query),
  });
}

export function shipOrderDetailApi(id: string) {
  return http.get<never, ShipOrder>(`/shipping/orders/${id}`);
}

export function payShipOrderApi(id: string, idempotencyKey = makeShippingPayKey(id)) {
  return http.post<never, ShipOrder>(
    `/shipping/orders/${id}/pay`,
    undefined,
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
}

export function collectShipOrderApi(id: string) {
  return http.post<never, ShipOrder>(`/shipping/orders/${id}/collect`);
}

export function shipOrderTracksApi(id: string) {
  return http.get<never, LogisticsTrack[]>(`/shipping/orders/${id}/tracks`);
}
