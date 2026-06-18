import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';

export const TOKEN_STORAGE_KEY = 'cn_token';
export const REFRESH_TOKEN_STORAGE_KEY = 'cn_refresh_token';

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
    this.name = 'ApiError';
  }
}

export function unwrapApiResponse<T>(payload: ApiResponse<T>): T {
  if (payload.code === 0) {
    return payload.data;
  }
  throw new ApiError(payload.code, payload.message);
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function getStoredRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
}

export function setStoredRefreshToken(token: string) {
  localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api';

export const http = axios.create({
  baseURL: API_BASE,
  timeout: 12000,
});

http.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function redirectToLogin() {
  clearStoredToken();
  if (location.pathname !== '/login') {
    const redirect = encodeURIComponent(location.pathname + location.search);
    location.assign(`/login?redirect=${redirect}`);
  }
}

// Raw axios call (no interceptors) so a refresh request that itself 401s does
// not recurse back into the refresh logic.
async function requestNewAccessToken(refreshToken: string): Promise<string> {
  const { data } = await axios.post<ApiResponse<{ accessToken: string; refreshToken?: string }>>(
    `${API_BASE}/auth/refresh`,
    { refreshToken },
    { timeout: 12000 },
  );
  const result = unwrapApiResponse(data);
  setStoredToken(result.accessToken);
  if (result.refreshToken) {
    setStoredRefreshToken(result.refreshToken);
  }
  return result.accessToken;
}

// De-duplicate concurrent refreshes: many in-flight requests sharing one 401
// should trigger a single refresh round-trip.
let refreshInFlight: Promise<string> | null = null;

function refreshAccessToken(refreshToken: string): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = requestNewAccessToken(refreshToken).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

export interface ResponseErrorDeps {
  getRefreshToken: () => string | null;
  refresh: (refreshToken: string) => Promise<string>;
  replay: (config: RetriableConfig) => Promise<unknown>;
  onAuthFailure: () => void;
  notify: (message: string) => void;
}

// Exported so the 401 -> refresh -> retry flow can be unit-tested with mocked
// dependencies instead of a live backend.
export function createResponseErrorHandler(deps: ResponseErrorDeps) {
  return async (error: AxiosError<ApiResponse<null>>) => {
    const config = error.config as RetriableConfig | undefined;

    if (error.response?.status === 401) {
      const refreshToken = deps.getRefreshToken();
      const isRefreshCall = config?.url?.includes('/auth/refresh');

      // Try a single silent refresh + replay before hard-logging out.
      if (config && refreshToken && !config._retried && !isRefreshCall) {
        config._retried = true;
        try {
          const accessToken = await deps.refresh(refreshToken);
          config.headers = config.headers ?? {};
          config.headers.Authorization = `Bearer ${accessToken}`;
          return deps.replay(config);
        } catch {
          deps.onAuthFailure();
          return Promise.reject(error);
        }
      }

      deps.onAuthFailure();
      return Promise.reject(error);
    }

    const payload = error.response?.data;
    if (payload?.message) {
      deps.notify(payload.message);
      return Promise.reject(new ApiError(payload.code, payload.message));
    }

    return Promise.reject(error);
  };
}

http.interceptors.response.use(
  (response) => unwrapApiResponse(response.data),
  createResponseErrorHandler({
    getRefreshToken: getStoredRefreshToken,
    refresh: refreshAccessToken,
    replay: (config) => http(config),
    onAuthFailure: redirectToLogin,
    notify: (message) => ElMessage.error(message),
  }),
);
