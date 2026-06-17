import { http } from './http';

export interface LoginPayload {
  username: string;
  password: string;
}

export interface AuthUser {
  id: string;
  username: string;
  tenantId: string | null;
  roles: string[];
  isPlatform: boolean;
  perms?: string[];
}

export interface LoginResult {
  accessToken: string;
  user: AuthUser;
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

export function meApi() {
  return http.get<never, AuthUser>('/auth/me');
}

export function permissionsApi() {
  return http.get<never, string[]>('/auth/permissions');
}

export function menusApi() {
  return http.get<never, MenuGroup[]>('/auth/menus');
}
