import { describe, expect, it, vi } from "vitest";
import { http } from "./http";
import {
  archiveBillingPlanApi,
  billingInvoicesApi,
  billingPlansApi,
  billingSubscriptionsApi,
  billingUsageApi,
  createBillingPlanApi,
  runBillingInvoiceApi,
  updateBillingPlanApi,
} from "./billing";

describe("admin billing api", () => {
  it("maps plan CRUD and archive endpoints", async () => {
    const get = vi.spyOn(http, "get").mockResolvedValue([]);
    const post = vi.spyOn(http, "post").mockResolvedValue({});
    const put = vi.spyOn(http, "put").mockResolvedValue({});
    const input = {
      code: "STANDARD",
      name: "标准版",
      monthlyPrice: 19900,
      quotas: { sms: 1000 },
      overagePrices: { sms: 8 },
    };

    await billingPlansApi();
    await createBillingPlanApi(input);
    await updateBillingPlanApi("plan-1", { name: "旗舰版" });
    await archiveBillingPlanApi("plan-1");

    expect(get).toHaveBeenCalledWith("/billing/plans");
    expect(post).toHaveBeenCalledWith("/billing/plans", input);
    expect(put).toHaveBeenCalledWith("/billing/plans/plan-1", {
      name: "旗舰版",
    });
    expect(post).toHaveBeenCalledWith("/billing/plans/plan-1/archive");
  });

  it("maps subscription, invoice, usage and manual invoice run endpoints", async () => {
    const get = vi.spyOn(http, "get").mockResolvedValue([]);
    const post = vi.spyOn(http, "post").mockResolvedValue({});

    await billingSubscriptionsApi({ tenantId: "tenant-1", status: "" });
    await billingInvoicesApi({ status: "OPEN" });
    await billingUsageApi({ subscriptionId: "sub-1" });
    await runBillingInvoiceApi({ tenantId: "tenant-1", subscriptionId: "sub-1" });

    expect(get).toHaveBeenCalledWith("/billing/subscriptions", {
      params: { tenantId: "tenant-1" },
    });
    expect(get).toHaveBeenCalledWith("/billing/invoices", {
      params: { status: "OPEN" },
    });
    expect(get).toHaveBeenCalledWith("/billing/usage", {
      params: { subscriptionId: "sub-1" },
    });
    expect(post).toHaveBeenCalledWith("/billing/invoices/run", {
      tenantId: "tenant-1",
      subscriptionId: "sub-1",
    });
  });
});
