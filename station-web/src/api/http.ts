import axios, { AxiosError } from 'axios';
import { ElMessage } from 'element-plus';

export const TOKEN_STORAGE_KEY = 'cn_token';

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

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? '/api',
  timeout: 12000,
});

http.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => unwrapApiResponse(response.data),
  (error: AxiosError<ApiResponse<null>>) => {
    if (error.response?.status === 401) {
      clearStoredToken();
      if (location.pathname !== '/login') {
        const redirect = encodeURIComponent(location.pathname + location.search);
        location.assign(`/login?redirect=${redirect}`);
      }
      return Promise.reject(error);
    }

    const payload = error.response?.data;
    if (payload?.message) {
      ElMessage.error(payload.message);
      return Promise.reject(new ApiError(payload.code, payload.message));
    }

    return Promise.reject(error);
  },
);
