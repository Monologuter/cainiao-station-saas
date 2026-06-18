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
import { toastError } from '@/utils/request';

export const useShippingStore = defineStore('shipping', {
  state: () => ({
    quotes: [] as ShippingQuote[],
    list: [] as ShipOrder[],
    current: null as ShipOrder | null,
    tracks: [] as LogisticsTrack[],
    loading: false,
    error: '',
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
      this.loading = true;
      this.error = '';
      try {
        const result = await listMyShipOrdersApi(query);
        this.list = result.list;
        return result;
      } catch (error) {
        this.error = error instanceof Error ? error.message : '寄件订单加载失败';
        toastError(error, '寄件订单加载失败');
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async loadDetail(id: string) {
      this.loading = true;
      this.error = '';
      try {
        const [order, tracks] = await Promise.all([
          shipOrderDetailApi(id),
          shipOrderTracksApi(id),
        ]);
        this.current = order;
        this.tracks = tracks;
        return order;
      } catch (error) {
        this.error = error instanceof Error ? error.message : '物流轨迹加载失败';
        toastError(error, '物流轨迹加载失败');
        throw error;
      } finally {
        this.loading = false;
      }
    },
  },
});
