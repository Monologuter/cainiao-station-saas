import { http, rawHttp, unwrapApiResponse, type ApiResponse } from "./http";

export interface AuthUser {
  id: string;
  userId?: string;
  username: string;
  tenantId: string | null;
  roles: string[];
  isPlatform: boolean;
  perms?: string[];
  allStations?: boolean;
  stations?: string[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface LoginInput {
  username: string;
  password: string;
}

/** 平台运营登录：POST /api/auth/login → {accessToken, refreshToken, user}。 */
export function loginApi(input: LoginInput) {
  return http.post<never, AuthTokens>("/auth/login", input);
}

/** 当前登录用户资料：GET /api/auth/me → user(含 perms)。 */
export function meApi() {
  return http.get<never, AuthUser>("/auth/me");
}

/**
 * 刷新令牌：POST /api/auth/refresh，body {refreshToken}。
 * 使用裸 axios 实例，避免被业务 http 的 401 重试拦截器递归调用。
 */
export async function refreshApi(refreshToken: string): Promise<AuthTokens> {
  const res = await rawHttp.post<ApiResponse<AuthTokens>>("/auth/refresh", {
    refreshToken,
  });
  return unwrapApiResponse(res.data);
}

/** 退出登录：吊销 refreshToken（失败静默，前端仍会清理本地状态）。 */
export function logoutApi(refreshToken: string) {
  return http.post<never, void>("/auth/logout", { refreshToken });
}
