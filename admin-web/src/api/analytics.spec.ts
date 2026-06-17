import { describe, expect, it, vi } from "vitest";
import { http } from "./http";
import {
  platformOverviewApi,
  tenantCompareApi,
  toAdminAnalyticsQueryParams,
} from "./analytics";

describe("admin analytics api", () => {
  it("drops empty platform analytics query params", () => {
    expect(
      toAdminAnalyticsQueryParams({
        metric: "inbound",
        date: "",
        limit: undefined,
      }),
    ).toEqual({ metric: "inbound" });
  });

  it("maps platform overview and tenant comparison endpoints", async () => {
    const get = vi.spyOn(http, "get").mockResolvedValue({ rows: [] });

    await platformOverviewApi({ date: "2026-06-18" });
    await tenantCompareApi({ metric: "inbound", date: "2026-06-18" });

    expect(get).toHaveBeenCalledWith("/admin/analytics/overview", {
      params: { date: "2026-06-18" },
    });
    expect(get).toHaveBeenCalledWith("/admin/analytics/tenants/compare", {
      params: { metric: "inbound", date: "2026-06-18" },
    });
  });
});
