import { defineStore } from 'pinia';
import {
  loginApi,
  meApi,
  menusApi,
  permissionsApi,
  type AuthUser,
  type MenuGroup,
} from '@/api/auth';
import {
  ApiError,
  clearStoredToken,
  getStoredToken,
  setStoredRefreshToken,
  setStoredToken,
} from '@/api/http';

export const STATION_STORAGE_KEY = 'cn_station_id';

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
      if (result.user.isPlatform) {
        clearStoredToken();
        localStorage.removeItem(STATION_STORAGE_KEY);
        throw new ApiError(1003, '平台账号请使用平台运营后台登录');
      }
      this.token = result.accessToken;
      this.user = result.user;
      this.routesReady = false;
      setStoredToken(result.accessToken);
      if (result.refreshToken) {
        setStoredRefreshToken(result.refreshToken);
      }
      syncDefaultStationId(result.user);
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
      if (user.isPlatform) {
        this.logout();
        throw new ApiError(1003, '平台账号请使用平台运营后台登录');
      }
      // /auth/me is the source of truth for identity (id, username, tenantId,
      // roles, stations…). Merge over any existing user so a refresh never
      // drops fields the login response had set.
      this.user = { ...this.user, ...user };
      this.perms = perms;
      this.menus = menus;
      syncDefaultStationId(this.user);
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
      localStorage.removeItem(STATION_STORAGE_KEY);
    },
  },
});

export function stationIdOf(
  station: NonNullable<AuthUser['stations']>[number],
) {
  return typeof station === 'string' ? station : station.id;
}

export function syncDefaultStationId(user: AuthUser | null) {
  if (!user || user.isPlatform) {
    localStorage.removeItem(STATION_STORAGE_KEY);
    return null;
  }
  const stationIds = (user.stations ?? []).map(stationIdOf).filter(Boolean);
  const current = localStorage.getItem(STATION_STORAGE_KEY);
  if (current && stationIds.includes(current)) {
    return current;
  }
  const next = stationIds[0] ?? null;
  if (next) {
    localStorage.setItem(STATION_STORAGE_KEY, next);
  } else {
    localStorage.removeItem(STATION_STORAGE_KEY);
  }
  return next;
}
