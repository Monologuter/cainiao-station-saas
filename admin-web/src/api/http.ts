import axios, { AxiosError } from "axios";
import { ElMessage } from "element-plus";

export const TOKEN_STORAGE_KEY = "cn_admin_token";

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

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? "/api",
  timeout: 12000,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => unwrapApiResponse(response.data),
  (error: AxiosError<ApiResponse<null>>) => {
    const payload = error.response?.data;
    if (payload?.message) {
      ElMessage.error(payload.message);
      return Promise.reject(new ApiError(payload.code, payload.message));
    }
    return Promise.reject(error);
  },
);
