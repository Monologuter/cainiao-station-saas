import { http } from './http';

export interface LoginPayload {
  username: string;
  password: string;
}

export interface AuthStation {
  id: string;
  name: string;
}

export interface AuthUser {
  id: string;
  username: string;
  tenantId: string | null;
  roles: string[];
  isPlatform: boolean;
  perms?: string[];
  stations?: AuthStation[];
  allStations?: boolean;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken?: string;
}

export interface MenuItem {
  code: string;
  title: string;
  path: string;
  icon: string;
  perm?: string;
  disabled?: boolean;
  badge?: string;
}

export interface MenuGroup {
  group: string;
  items: MenuItem[];
}

export function loginApi(payload: LoginPayload) {
  return http.post<never, LoginResult>('/auth/login', payload);
}

export function refreshApi(refreshToken: string) {
  return http.post<never, RefreshResult>('/auth/refresh', { refreshToken });
}

export function meApi() {
  return http.get<never, AuthUser>('/auth/me');
}

export function permissionsApi() {
  return http.get<never, string[]>('/auth/permissions');
}

export function menusApi() {
  return http.get<never, MenuGroup[]>('/auth/menus');
}
