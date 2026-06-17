import { describe, expect, it } from "vitest";
import ExceptionsView from "@/views/ExceptionsView.vue";
import PlaceholderView from "@/views/PlaceholderView.vue";
import ComplaintsView from "@/views/ComplaintsView.vue";
import CouponsView from "@/views/CouponsView.vue";
import ReviewsView from "@/views/ReviewsView.vue";
import StatisticsView from "@/views/StatisticsView.vue";
import { availableRoutes, stationRouteDefs } from "./routes";

describe("station route definitions", () => {
  it("exposes shipping route only with shipping:read permission", () => {
    expect(availableRoutes([]).map((route) => route.code)).not.toContain(
      "shipping",
    );
    expect(
      availableRoutes(["shipping:read"]).map((route) => route.code),
    ).toContain("shipping");
  });

  it("uses a real shipping management view instead of the placeholder", () => {
    expect(
      stationRouteDefs.find((route) => route.code === "shipping")?.component,
    ).not.toBe(PlaceholderView);
  });

  it("exposes exceptions route only with exception:read permission", () => {
    expect(availableRoutes([]).map((route) => route.code)).not.toContain(
      "exceptions",
    );
    expect(
      availableRoutes(["exception:read"]).map((route) => route.code),
    ).toContain("exceptions");
    expect(
      stationRouteDefs.find((route) => route.code === "exceptions")?.component,
    ).toBe(ExceptionsView);
  });

  it("exposes review, complaint and coupon routes with real views", () => {
    const codes = availableRoutes([
      "review:read",
      "complaint:read",
      "coupon:manage",
    ]).map((route) => route.code);

    expect(codes).toEqual(
      expect.arrayContaining(["reviews", "complaints", "coupons"]),
    );
    expect(
      stationRouteDefs.find((route) => route.code === "reviews")?.component,
    ).toBe(ReviewsView);
    expect(
      stationRouteDefs.find((route) => route.code === "complaints")?.component,
    ).toBe(ComplaintsView);
    expect(
      stationRouteDefs.find((route) => route.code === "coupons")?.component,
    ).toBe(CouponsView);
  });

  it("exposes statistics route with analytics:read and a real view", () => {
    expect(availableRoutes([]).map((route) => route.code)).not.toContain(
      "statistics",
    );
    expect(
      availableRoutes(["analytics:read"]).map((route) => route.code),
    ).toContain("statistics");
    expect(
      stationRouteDefs.find((route) => route.code === "statistics")?.component,
    ).toBe(StatisticsView);
  });
});
