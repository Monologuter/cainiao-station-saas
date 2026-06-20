import { describe, expect, it } from "vitest";
import ExceptionsView from "@/views/ExceptionsView.vue";
import ComplaintsView from "@/views/ComplaintsView.vue";
import CouponsView from "@/views/CouponsView.vue";
import BillingSettingsView from "@/views/BillingSettingsView.vue";
import ReviewsView from "@/views/ReviewsView.vue";
import StatisticsView from "@/views/StatisticsView.vue";
import { isPublicRoutePath, router } from "@/router";
import {
  availableRoutes,
  stationRouteDefs,
  type StationRouteDef,
} from "./routes";

/**
 * 路由组件现以懒加载方式声明（`() => import('@/views/XxxView.vue')`），
 * 因此断言时需解析该异步加载器，比较其 default 导出是否为目标视图。
 */
async function resolveComponent(route: StationRouteDef | undefined) {
  expect(route).toBeDefined();
  expect(typeof route?.component).toBe("function");
  const mod = await route!.component();
  return mod.default;
}

describe("station route definitions", () => {
  it("exposes shipping route only with shipping:read permission", () => {
    expect(availableRoutes([]).map((route) => route.code)).not.toContain(
      "shipping",
    );
    expect(
      availableRoutes(["shipping:read"]).map((route) => route.code),
    ).toContain("shipping");
  });

  it("uses a real lazy-loaded shipping management view", async () => {
    const route = stationRouteDefs.find((r) => r.code === "shipping");
    expect(typeof route?.component).toBe("function");
    const mod = await route!.component();
    expect(mod.default).toBeTruthy();
  });

  it("exposes exceptions route only with exception:read permission", async () => {
    expect(availableRoutes([]).map((route) => route.code)).not.toContain(
      "exceptions",
    );
    expect(
      availableRoutes(["exception:read"]).map((route) => route.code),
    ).toContain("exceptions");
    const component = await resolveComponent(
      stationRouteDefs.find((route) => route.code === "exceptions"),
    );
    expect(component).toBe(ExceptionsView);
  });

  it("exposes review, complaint and coupon routes with real views", async () => {
    const codes = availableRoutes([
      "review:read",
      "complaint:read",
      "coupon:manage",
    ]).map((route) => route.code);

    expect(codes).toEqual(
      expect.arrayContaining(["reviews", "complaints", "coupons"]),
    );
    expect(
      await resolveComponent(
        stationRouteDefs.find((route) => route.code === "reviews"),
      ),
    ).toBe(ReviewsView);
    expect(
      await resolveComponent(
        stationRouteDefs.find((route) => route.code === "complaints"),
      ),
    ).toBe(ComplaintsView);
    expect(
      await resolveComponent(
        stationRouteDefs.find((route) => route.code === "coupons"),
      ),
    ).toBe(CouponsView);
  });

  it("exposes statistics route with analytics:read and a real view", async () => {
    expect(availableRoutes([]).map((route) => route.code)).not.toContain(
      "statistics",
    );
    expect(
      availableRoutes(["analytics:read"]).map((route) => route.code),
    ).toContain("statistics");
    expect(
      await resolveComponent(
        stationRouteDefs.find((route) => route.code === "statistics"),
      ),
    ).toBe(StatisticsView);
  });

  it("exposes billing settings only when subscription and invoice read permissions are both present", async () => {
    expect(
      availableRoutes(["subscription:read"]).map((route) => route.code),
    ).not.toContain("billing-settings");
    expect(
      availableRoutes(["invoice:read"]).map((route) => route.code),
    ).not.toContain("billing-settings");
    expect(
      availableRoutes(["subscription:read", "invoice:read"]).map(
        (route) => route.code,
      ),
    ).toContain("billing-settings");
    expect(
      await resolveComponent(
        stationRouteDefs.find((route) => route.code === "billing-settings"),
      ),
    ).toBe(BillingSettingsView);
  });

  it("declares every route component as a lazy import loader", () => {
    for (const route of stationRouteDefs) {
      expect(typeof route.component).toBe("function");
    }
  });

  it("treats onboarding application as a public route", () => {
    expect(isPublicRoutePath("/onboarding/apply")).toBe(true);
    expect(isPublicRoutePath("/workbench")).toBe(false);
  });

  it("registers station pages statically so direct browser entry works", () => {
    const resolved = router.resolve("/inbound");

    expect(resolved.matched.map((record) => record.name)).toContain("Inbound");
  });

  it("redirects unknown legacy paths back to the workbench", () => {
    const resolved = router.resolve("/platform/tenants");

    expect(resolved.matched.at(-1)?.redirect).toBe("/workbench");
  });
});
