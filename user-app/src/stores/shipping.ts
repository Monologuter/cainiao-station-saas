import { defineStore } from 'pinia';
import {
  createShipOrderApi,
  listMyShipOrdersApi,
  payShipOrderApi,
  quoteShippingApi,
  shipOrderDetailApi,
  shipOrderTracksApi,
  type CreateShipOrderPayload,
  type LogisticsTrack,
  type ShipOrder,
  type ShipOrderQuery,
  type ShippingQuote,
  type ShippingQuotePayload,
} from '@/api/shipping';

export const useShippingStore = defineStore('shipping', {
  state: () => ({
    quotes: [] as ShippingQuote[],
    list: [] as ShipOrder[],
    current: null as ShipOrder | null,
    tracks: [] as LogisticsTrack[],
  }),
  getters: {
    firstPayable: (state) => state.list.find((item) => item.status === 'CREATED') ?? null,
  },
  actions: {
    async quote(payload: ShippingQuotePayload) {
      this.quotes = await quoteShippingApi(payload);
      return this.quotes;
    },
    async create(payload: CreateShipOrderPayload) {
      this.current = await createShipOrderApi(payload);
      return this.current;
    },
    async pay(id: string) {
      this.current = await payShipOrderApi(id);
      return this.current;
    },
    async load(query: ShipOrderQuery = {}) {
      const result = await listMyShipOrdersApi(query);
      this.list = result.list;
      return result;
    },
    async loadDetail(id: string) {
      const [order, tracks] = await Promise.all([
        shipOrderDetailApi(id),
        shipOrderTracksApi(id),
      ]);
      this.current = order;
      this.tracks = tracks;
      return order;
    },
  },
});
