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

const LOGIN_PAGE = '/pages/login/index';

let redirectingToLogin = false;

/**
 * 消费者侧仅有 pickToken（无 refresh）。HTTP 401 或业务 code 401 时：
 * 清 token + 跳登录页 + 提示，避免页面继续用失效凭证打接口。
 */
export function handleUnauthorized(message?: string) {
  clearPickToken();
  uni.showToast({ title: message || '登录已过期，请重新登录', icon: 'none' });
  if (redirectingToLogin) {
    return;
  }
  redirectingToLogin = true;
  uni.reLaunch({
    url: LOGIN_PAGE,
    complete() {
      redirectingToLogin = false;
    },
  });
}

/** 统一错误提示：业务错误用接口 message，其余给兜底文案。 */
export function toastError(error: unknown, fallback = '网络异常，请稍后再试') {
  const message = error instanceof Error && error.message ? error.message : fallback;
  uni.showToast({ title: message, icon: 'none' });
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
        if (res.statusCode === 401) {
          handleUnauthorized();
          reject(new ApiError(401, '登录已过期，请重新登录'));
          return;
        }
        try {
          resolve(unwrapResponse(res.data as ApiResponse<T>));
        } catch (error) {
          if (error instanceof ApiError && error.code === 401) {
            handleUnauthorized(error.message);
          }
          reject(error);
        }
      },
      fail(err) {
        reject(new ApiError(-1, err?.errMsg || '网络异常，请稍后再试'));
      },
    });
  });
}
