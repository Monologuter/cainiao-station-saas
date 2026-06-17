export const PICK_TOKEN_KEY = 'cn_pick_token';

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

export function unwrapResponse<T>(response: ApiResponse<T>) {
  if (response.code === 0) {
    return response.data;
  }
  throw new ApiError(response.code, response.message);
}

export function authHeader(token: string | null | undefined) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getPickToken() {
  return uni.getStorageSync(PICK_TOKEN_KEY) as string | undefined;
}

export function setPickToken(token: string) {
  uni.setStorageSync(PICK_TOKEN_KEY, token);
}

export function clearPickToken() {
  uni.removeStorageSync(PICK_TOKEN_KEY);
}

export function request<T>(options: UniApp.RequestOptions) {
  return new Promise<T>((resolve, reject) => {
    uni.request({
      ...options,
      header: {
        ...(options.header ?? {}),
        ...authHeader(getPickToken()),
      },
      success(res) {
        try {
          resolve(unwrapResponse(res.data as ApiResponse<T>));
        } catch (error) {
          reject(error);
        }
      },
      fail: reject,
    });
  });
}
