import { afterEach, describe, expect, it, vi } from "vitest";
import { http, rawHttp } from "./http";
import { loginApi, logoutApi, meApi, refreshApi } from "./auth";

describe("admin auth api", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps login, me and logout to /auth endpoints", async () => {
    const get = vi.spyOn(http, "get").mockResolvedValue({});
    const post = vi.spyOn(http, "post").mockResolvedValue({});

    await loginApi({ username: "admin", password: "admin123456" });
    await meApi();
    await logoutApi("refresh-token-1");

    expect(post).toHaveBeenCalledWith("/auth/login", {
      username: "admin",
      password: "admin123456",
    });
    expect(get).toHaveBeenCalledWith("/auth/me");
    expect(post).toHaveBeenCalledWith("/auth/logout", {
      refreshToken: "refresh-token-1",
    });
  });

  it("refreshes via raw axios and unwraps the envelope", async () => {
    const tokens = {
      accessToken: "new-access",
      refreshToken: "new-refresh",
      user: {
        id: "u1",
        username: "admin",
        tenantId: null,
        roles: ["平台超管"],
        isPlatform: true,
      },
    };
    const post = vi
      .spyOn(rawHttp, "post")
      .mockResolvedValue({ data: { code: 0, message: "ok", data: tokens } });

    const result = await refreshApi("refresh-token-1");

    expect(post).toHaveBeenCalledWith("/auth/refresh", {
      refreshToken: "refresh-token-1",
    });
    expect(result).toEqual(tokens);
  });
});
