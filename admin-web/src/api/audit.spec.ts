import { describe, expect, it, vi } from "vitest";
import { http } from "./http";
import { auditActionsApi, auditLogDetailApi, auditLogsApi } from "./audit";

describe("admin audit api", () => {
  it("maps audit list detail and actions endpoints", async () => {
    const get = vi.spyOn(http, "get").mockResolvedValue({});

    await auditLogsApi({
      tenantId: "tenant-1",
      action: "config.channel.update",
      result: "SUCCESS",
      page: 1,
    });
    await auditLogDetailApi("audit-1");
    await auditActionsApi();

    expect(get).toHaveBeenCalledWith("/admin/audit-logs", {
      params: {
        tenantId: "tenant-1",
        action: "config.channel.update",
        result: "SUCCESS",
        page: 1,
      },
    });
    expect(get).toHaveBeenCalledWith("/admin/audit-logs/audit-1");
    expect(get).toHaveBeenCalledWith("/admin/audit-logs/actions");
  });
});
