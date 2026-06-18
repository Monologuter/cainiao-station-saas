import { describe, expect, it, vi } from "vitest";
import { http } from "./http";
import {
  monitorOverviewApi,
  monitorStoreDetailApi,
  monitorStoresApi,
} from "./monitor";

describe("admin monitor api", () => {
  it("maps monitor overview stores and detail endpoints", async () => {
    const get = vi.spyOn(http, "get").mockResolvedValue({});

    await monitorOverviewApi();
    await monitorStoresApi({ page: 2, pageSize: 20 });
    await monitorStoreDetailApi("station-1");

    expect(get).toHaveBeenCalledWith("/admin/monitor/overview");
    expect(get).toHaveBeenCalledWith("/admin/monitor/stores", {
      params: { page: 2, pageSize: 20 },
    });
    expect(get).toHaveBeenCalledWith("/admin/monitor/stores/station-1");
  });
});
