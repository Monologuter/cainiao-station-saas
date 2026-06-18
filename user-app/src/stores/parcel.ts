import { defineStore } from 'pinia';
import {
  consumerParcelDetailApi,
  listConsumerParcelsApi,
  type ConsumerParcel,
  type ConsumerParcelStatus,
} from '@/api/parcel';

export const useParcelStore = defineStore('parcel', {
  state: () => ({
    list: [] as ConsumerParcel[],
    current: null as ConsumerParcel | null,
  }),
  getters: {
    firstStored: (state) => state.list.find((item) => item.status === 'STORED') ?? null,
  },
  actions: {
    async load(status?: ConsumerParcelStatus | '') {
      const result = await listConsumerParcelsApi(status);
      this.list = result.list;
      return result;
    },
    async loadDetail(id: string) {
      this.current = await consumerParcelDetailApi(id);
      return this.current;
    },
  },
});
