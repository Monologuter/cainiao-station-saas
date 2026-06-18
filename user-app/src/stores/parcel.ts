import { defineStore } from 'pinia';
import {
  consumerParcelDetailApi,
  listConsumerParcelsApi,
  type ConsumerParcel,
  type ConsumerParcelStatus,
} from '@/api/parcel';
import { toastError } from '@/utils/request';

export const useParcelStore = defineStore('parcel', {
  state: () => ({
    list: [] as ConsumerParcel[],
    current: null as ConsumerParcel | null,
    loading: false,
    error: '',
  }),
  getters: {
    firstStored: (state) => state.list.find((item) => item.status === 'STORED') ?? null,
  },
  actions: {
    async load(status?: ConsumerParcelStatus | '') {
      this.loading = true;
      this.error = '';
      try {
        const result = await listConsumerParcelsApi(status);
        this.list = result.list;
        return result;
      } catch (error) {
        this.error = error instanceof Error ? error.message : '包裹加载失败';
        toastError(error, '包裹加载失败');
        throw error;
      } finally {
        this.loading = false;
      }
    },
    async loadDetail(id: string) {
      this.loading = true;
      this.error = '';
      try {
        this.current = await consumerParcelDetailApi(id);
        return this.current;
      } catch (error) {
        this.error = error instanceof Error ? error.message : '包裹详情加载失败';
        toastError(error, '包裹详情加载失败');
        throw error;
      } finally {
        this.loading = false;
      }
    },
  },
});
