import { defineStore } from 'pinia';
import { loginApi, meApi, type AuthUser } from '@/api/auth';
import { clearStoredToken, getStoredToken, setStoredToken } from '@/api/http';

interface AuthState {
  token: string;
  user: AuthUser | null;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: getStoredToken() ?? '',
    user: null,
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.token),
  },
  actions: {
    async login(username: string, password: string) {
      const result = await loginApi({ username, password });
      this.token = result.accessToken;
      this.user = result.user;
      setStoredToken(result.accessToken);
      return result;
    },
    async loadProfile() {
      if (!this.token) {
        return null;
      }
      this.user = await meApi();
      return this.user;
    },
    logout() {
      this.token = '';
      this.user = null;
      clearStoredToken();
    },
  },
});
