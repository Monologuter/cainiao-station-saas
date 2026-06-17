import { defineStore } from 'pinia';
import {
  loginApi,
  meApi,
  menusApi,
  permissionsApi,
  type AuthUser,
  type MenuGroup,
} from '@/api/auth';
import { clearStoredToken, getStoredToken, setStoredToken } from '@/api/http';

interface AuthState {
  token: string;
  user: AuthUser | null;
  perms: string[];
  menus: MenuGroup[];
  routesReady: boolean;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: getStoredToken() ?? '',
    user: null,
    perms: [],
    menus: [],
    routesReady: false,
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.token),
  },
  actions: {
    async login(username: string, password: string) {
      const result = await loginApi({ username, password });
      this.token = result.accessToken;
      this.user = result.user;
      this.routesReady = false;
      setStoredToken(result.accessToken);
      return result;
    },
    async loadProfile() {
      if (!this.token) {
        return null;
      }
      const [user, perms, menus] = await Promise.all([
        meApi(),
        permissionsApi(),
        menusApi(),
      ]);
      this.user = user;
      this.perms = perms;
      this.menus = menus;
      return this.user;
    },
    hasPerm(code: string) {
      return this.perms.includes(code);
    },
    logout() {
      this.token = '';
      this.user = null;
      this.perms = [];
      this.menus = [];
      this.routesReady = false;
      clearStoredToken();
    },
  },
});
