import { defineStore } from "pinia";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  registerAuthHandlers,
  setTokens,
} from "@/api/http";
import {
  loginApi,
  logoutApi,
  meApi,
  refreshApi,
  type AuthUser,
  type LoginInput,
} from "@/api/auth";

interface AuthState {
  user: AuthUser | null;
  /** 资料是否已尝试加载（用于路由守卫判断是否需要先拉 /me）。 */
  initialized: boolean;
}

export const useAuthStore = defineStore("admin-auth", {
  state: (): AuthState => ({
    user: null,
    initialized: false,
  }),
  getters: {
    /** 是否持有访问令牌（不代表资料已就绪）。 */
    hasToken: (): boolean => Boolean(getAccessToken()),
    isAuthenticated: (state): boolean =>
      Boolean(getAccessToken()) && state.user !== null,
    username: (state): string => state.user?.username ?? "运营管理员",
    perms: (state): string[] => state.user?.perms ?? [],
  },
  actions: {
    /** 平台运营登录：换取并持久化令牌，写入用户资料。 */
    async login(input: LoginInput): Promise<void> {
      const result = await loginApi(input);
      setTokens(result.accessToken, result.refreshToken);
      this.user = result.user;
      this.initialized = true;
    },

    /** 拉取当前用户资料（带 perms）。无 token 时直接置空。 */
    async loadProfile(): Promise<AuthUser | null> {
      if (!getAccessToken()) {
        this.user = null;
        this.initialized = true;
        return null;
      }
      try {
        this.user = await meApi();
      } catch {
        // 401 会被 http 拦截器处理（刷新/跳登录），其余错误下置空资料。
        this.user = null;
      }
      this.initialized = true;
      return this.user;
    },

    /**
     * 用 refreshToken 换取新令牌。供 http 401 拦截器调用。
     * 成功返回新的 accessToken；失败返回 null。
     */
    async refresh(): Promise<string | null> {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return null;
      try {
        const result = await refreshApi(refreshToken);
        setTokens(result.accessToken, result.refreshToken);
        this.user = result.user;
        this.initialized = true;
        return result.accessToken;
      } catch {
        return null;
      }
    },

    /** 退出登录：吊销远端 refreshToken（静默失败）并清理本地状态。 */
    async logout(): Promise<void> {
      const refreshToken = getRefreshToken();
      if (refreshToken) {
        try {
          await logoutApi(refreshToken);
        } catch {
          /* 忽略：本地仍需清理 */
        }
      }
      this.clearSession();
    },

    /** 仅清理本地登录态（令牌 + 内存资料）。 */
    clearSession(): void {
      clearTokens();
      this.user = null;
      this.initialized = true;
    },
  },
});

/**
 * 把 store 的刷新/过期回调注册进 http 拦截器。
 * 在 main.ts 安装 pinia 之后调用一次。
 */
export function bindAuthToHttp(): void {
  const store = useAuthStore();
  registerAuthHandlers({
    refresh: () => store.refresh(),
    onExpired: () => store.clearSession(),
  });
}
