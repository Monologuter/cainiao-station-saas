import { defineStore } from 'pinia';
import { sendCodeApi, verifyCodeApi } from '@/api/auth';
import { clearPickToken, getPickToken, setPickToken } from '@/utils/request';

export const useUserStore = defineStore('user', {
  state: () => ({
    phone: '',
    pickToken: getPickToken() ?? '',
  }),
  actions: {
    async sendCode(phone: string) {
      await sendCodeApi(phone);
      this.phone = phone;
    },
    async verifyCode(phone: string, code: string) {
      const result = await verifyCodeApi(phone, code);
      this.phone = phone;
      this.pickToken = result.pickToken;
      setPickToken(result.pickToken);
      return result;
    },
    logout() {
      this.pickToken = '';
      this.phone = '';
      clearPickToken();
    },
  },
});
