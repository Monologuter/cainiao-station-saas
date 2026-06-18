import { describe, expect, it, vi } from "vitest";
import { http } from "./http";
import { tenantsApi, updateTenantStatusApi } from "./tenants";

describe("admin tenants api", () => {
  it("maps tenant list and status endpoints", async () => {
    const get = vi.spyOn(http, "get").mockResolvedValue({ list: [], total: 0 });
    const patch = vi.spyOn(http, "patch").mockResolvedValue({});

    await tenantsApi({ status: "ACTIVE" });
    await updateTenantStatusApi("tenant-1", "SUSPENDED");

    expect(get).toHaveBeenCalledWith("/platform/tenants", {
      params: { status: "ACTIVE" },
    });
    expect(patch).toHaveBeenCalledWith("/platform/tenants/tenant-1/status", {
      status: "SUSPENDED",
    });
  });
});
