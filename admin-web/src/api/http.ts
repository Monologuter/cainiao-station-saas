import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import { ElMessage } from "element-plus";

export const TOKEN_STORAGE_KEY = "cn_admin_token";
export const REFRESH_TOKEN_STORAGE_KEY = "cn_admin_refresh_token";

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function unwrapApiResponse<T>(payload: ApiResponse<T>): T {
  if (payload.code === 0) {
    return payload.data;
  }
  throw new ApiError(payload.code, payload.message);
}

const baseURL = import.meta.env.VITE_API_BASE ?? "/api";

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
}

/**
 * 裸 axios 实例：不带 401 重试拦截器，专供 /auth/refresh 调用，
 * 避免刷新请求本身触发刷新而无限递归。
 */
export const rawHttp = axios.create({ baseURL, timeout: 12000 });

/** 业务 http 实例：响应自动解信封（成功返回 data，失败抛 ApiError）。 */
export const http = axios.create({ baseURL, timeout: 12000 });

http.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * 401 刷新钩子：由 auth store 注入。返回新的 accessToken（刷新成功）或 null（失败）。
 * 解耦放在此处，避免 http ↔ store 循环依赖。
 */
type RefreshHandler = () => Promise<string | null>;
let refreshHandler: RefreshHandler | null = null;
let onAuthExpired: (() => void) | null = null;

export function registerAuthHandlers(handlers: {
  refresh: RefreshHandler;
  onExpired: () => void;
}): void {
  refreshHandler = handlers.refresh;
  onAuthExpired = handlers.onExpired;
}

// 并发 401 时共享同一次刷新，避免多次刷新令牌。
let refreshing: Promise<string | null> | null = null;

function runRefresh(): Promise<string | null> {
  if (!refreshHandler) return Promise.resolve(null);
  if (!refreshing) {
    refreshing = refreshHandler().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

http.interceptors.response.use(
  (response) => unwrapApiResponse(response.data),
  async (error: AxiosError<ApiResponse<null>>) => {
    const status = error.response?.status;
    const original = error.config as RetriableConfig | undefined;
    const isRefreshCall = original?.url?.includes("/auth/refresh");

    // 401：尝试刷新令牌并重放一次原请求。
    if (status === 401 && original && !original._retried && !isRefreshCall) {
      original._retried = true;
      const newToken = await runRefresh();
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return http.request(original as AxiosRequestConfig);
      }
      // 刷新失败：清理并跳登录。
      onAuthExpired?.();
      return Promise.reject(new ApiError(1002, "登录已过期，请重新登录"));
    }

    const payload = error.response?.data;
    if (payload?.message) {
      ElMessage.error(payload.message);
      return Promise.reject(new ApiError(payload.code, payload.message));
    }
    return Promise.reject(error);
  },
);
