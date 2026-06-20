import { describe, expect, it, vi } from "vitest";
import { http } from "./http";
import { createTenantApi, tenantsApi, updateTenantStatusApi } from "./tenants";

describe("admin tenants api", () => {
  it("maps tenant list and status endpoints", async () => {
    const get = vi.spyOn(http, "get").mockResolvedValue({ list: [], total: 0 });
    const patch = vi.spyOn(http, "patch").mockResolvedValue({});

    await tenantsApi({ status: "ACTIVE", keyword: "城南", page: 2, size: 20 });
    await updateTenantStatusApi("tenant-1", "SUSPENDED");

    expect(get).toHaveBeenCalledWith("/platform/tenants", {
      params: { status: "ACTIVE", keyword: "城南", page: 2, size: 20 },
    });
    expect(patch).toHaveBeenCalledWith("/platform/tenants/tenant-1/status", {
      status: "SUSPENDED",
    });
  });

  it("posts new tenant payload", async () => {
    const post = vi.spyOn(http, "post").mockResolvedValue({});

    await createTenantApi({
      name: "新驿站",
      ownerName: "张三",
      ownerPhone: "13800138000",
      ownerPassword: "pw123456",
    });

    expect(post).toHaveBeenCalledWith("/platform/tenants", {
      name: "新驿站",
      ownerName: "张三",
      ownerPhone: "13800138000",
      ownerPassword: "pw123456",
    });
  });
});
