import { describe, expect, it, vi } from "vitest";
import { http } from "./http";
import {
  approveApplicationApi,
  applicationDetailApi,
  applicationsApi,
  rejectApplicationApi,
} from "./applications";

describe("admin applications api", () => {
  it("maps application list, detail and review endpoints", async () => {
    const get = vi.spyOn(http, "get").mockResolvedValue({});
    const post = vi.spyOn(http, "post").mockResolvedValue({});

    await applicationsApi({ status: "PENDING", keyword: "138", page: 1 });
    await applicationDetailApi("app-1");
    await approveApplicationApi("app-1", {
      planCode: "BASIC",
      stationName: "审核后门店",
    });
    await rejectApplicationApi("app-1", "证照不清晰");

    expect(get).toHaveBeenCalledWith("/admin/applications", {
      params: { status: "PENDING", keyword: "138", page: 1 },
    });
    expect(get).toHaveBeenCalledWith("/admin/applications/app-1");
    expect(post).toHaveBeenCalledWith("/admin/applications/app-1/approve", {
      planCode: "BASIC",
      stationName: "审核后门店",
    });
    expect(post).toHaveBeenCalledWith("/admin/applications/app-1/reject", {
      rejectReason: "证照不清晰",
    });
  });
});
