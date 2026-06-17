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

export function loginApi(payload: LoginPayload) {
  return http.post<never, LoginResult>('/auth/login', payload);
}

export function meApi() {
  return http.get<never, AuthUser>('/auth/me');
}
