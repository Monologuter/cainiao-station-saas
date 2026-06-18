import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosHeaders, type AxiosResponse } from "axios";
import {
  ApiError,
  http,
  registerAuthHandlers,
  TOKEN_STORAGE_KEY,
} from "./http";

function ok(data: unknown): AxiosResponse {
  return {
    data: { code: 0, message: "ok", data },
    status: 200,
    statusText: "OK",
    headers: {},
    config: { headers: new AxiosHeaders() } as never,
  };
}

describe("http 401 refresh-retry", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(TOKEN_STORAGE_KEY, "expired-token");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    registerAuthHandlers({
      refresh: async () => null,
      onExpired: () => {},
    });
  });

  it("refreshes then replays the original request on 401", async () => {
    // 真实场景：refresh 成功后 store 会把新 token 写入 localStorage，
    // 重放请求经请求拦截器自动带上新 token。
    const refresh = vi.fn(async () => {
      localStorage.setItem(TOKEN_STORAGE_KEY, "fresh-token");
      return "fresh-token";
    });
    const onExpired = vi.fn();
    registerAuthHandlers({ refresh, onExpired });

    const adapter = vi
      .spyOn(http.defaults, "adapter", "get")
      .mockReturnValue(async (config) => {
        const auth = (config.headers as AxiosHeaders)?.Authorization;
        if (auth === "Bearer fresh-token") {
          return ok({ ok: true });
        }
        // first attempt: simulate 401
        return Promise.reject(
          Object.assign(new Error("Unauthorized"), {
            config,
            response: {
              status: 401,
              data: { code: 1002, message: "unauthorized", data: null },
            },
          }),
        );
      });

    const result = await http.get("/admin/secure");

    expect(refresh).toHaveBeenCalledOnce();
    expect(onExpired).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
    adapter.mockRestore();
  });

  it("clears session when refresh fails on 401", async () => {
    const refresh = vi.fn(async () => null);
    const onExpired = vi.fn();
    registerAuthHandlers({ refresh, onExpired });

    vi.spyOn(http.defaults, "adapter", "get").mockReturnValue(async (config) =>
      Promise.reject(
        Object.assign(new Error("Unauthorized"), {
          config,
          response: {
            status: 401,
            data: { code: 1002, message: "unauthorized", data: null },
          },
        }),
      ),
    );

    await expect(http.get("/admin/secure")).rejects.toBeInstanceOf(ApiError);
    expect(refresh).toHaveBeenCalledOnce();
    expect(onExpired).toHaveBeenCalledOnce();
  });
});
