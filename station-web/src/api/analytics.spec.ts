import { describe, expect, it, vi } from "vitest";
import { http } from "./http";
import {
  createAnalyticsReportApi,
  forecastSummary,
  forecastVolumeApi,
  getAnalyticsReportApi,
  heatmapApi,
  overviewApi,
  overviewToKpis,
  rankingApi,
  runForecastApi,
  stationCompareApi,
  toAnalyticsQueryParams,
  trendApi,
} from "./analytics";

describe("analytics overview mapping", () => {
  it("maps backend overview to dashboard kpis", () => {
    expect(
      overviewToKpis({
        inboundToday: 12,
        pickedToday: 9,
        inStock: 32,
        pickupRate: 75,
        overdueCount: 2,
        notifyToday: 24,
      }).map((item) => [item.label, item.value]),
    ).toEqual([
      ["今日入库", "12"],
      ["今日出库", "9"],
      ["在库待取", "32"],
      ["取件率", "75%"],
      ["滞留预警", "2"],
    ]);
  });

  it("drops empty analytics query params", () => {
    expect(
      toAnalyticsQueryParams({
        stationId: "",
        metric: "inbound",
        date: "2026-06-18",
        limit: undefined,
      }),
    ).toEqual({ metric: "inbound", date: "2026-06-18" });
  });

  it("maps analytics dashboard endpoints", async () => {
    const get = vi.spyOn(http, "get").mockResolvedValue({});
    const post = vi.spyOn(http, "post").mockResolvedValue({ jobId: "job-1" });

    await overviewApi({ stationId: "s1" });
    await trendApi({ metric: "inbound", from: "2026-06-17", to: "2026-06-18" });
    await rankingApi({ type: "overdue", stationId: "s1", limit: 8 });
    await heatmapApi({ stationId: "s1" });
    await forecastVolumeApi({
      stationId: "s1",
      from: "2026-06-19",
      to: "2026-06-25",
      granularity: "DAY",
    });
    await runForecastApi({ stationId: "s1", horizon: 7, granularity: "DAY" });
    await stationCompareApi({ metric: "pickup", date: "2026-06-18" });
    await createAnalyticsReportApi({
      type: "daily_summary",
      format: "csv",
      from: "2026-06-17",
      to: "2026-06-18",
      stationId: "s1",
    });
    await getAnalyticsReportApi("job-1");

    expect(get).toHaveBeenCalledWith("/analytics/overview", {
      params: { stationId: "s1" },
    });
    expect(get).toHaveBeenCalledWith("/analytics/trend", {
      params: { metric: "inbound", from: "2026-06-17", to: "2026-06-18" },
    });
    expect(get).toHaveBeenCalledWith("/analytics/ranking", {
      params: { type: "overdue", stationId: "s1", limit: 8 },
    });
    expect(get).toHaveBeenCalledWith("/analytics/heatmap", {
      params: { stationId: "s1" },
    });
    expect(get).toHaveBeenCalledWith("/analytics/forecast/volume", {
      params: {
        stationId: "s1",
        from: "2026-06-19",
        to: "2026-06-25",
        granularity: "DAY",
      },
    });
    expect(post).toHaveBeenCalledWith("/analytics/forecast/run", {
      stationId: "s1",
      horizon: 7,
      granularity: "DAY",
    });
    expect(get).toHaveBeenCalledWith("/analytics/stations/compare", {
      params: { metric: "pickup", date: "2026-06-18" },
    });
    expect(post).toHaveBeenCalledWith("/analytics/reports", {
      type: "daily_summary",
      format: "csv",
      from: "2026-06-17",
      to: "2026-06-18",
      stationId: "s1",
    });
    expect(get).toHaveBeenCalledWith("/analytics/reports/job-1");
  });

  it("summarizes forecast confidence and peak hour", () => {
    expect(
      forecastSummary([
        {
          stationId: "s1",
          targetDate: "2026-06-19",
          granularity: "HOUR",
          predictedVolume: 36,
          lowerBound: 30,
          upperBound: 42,
          method: "MA",
          hourBreakdown: [0, 0, 0, 0, 0, 0, 0, 0, 3, 12, 9],
        },
      ]),
    ).toEqual({
      total: 36,
      method: "MA",
      peakHour: 9,
      peakVolume: 12,
      confidenceLabel: "30-42",
      coldStart: false,
    });

    expect(forecastSummary([])).toEqual({
      total: 0,
      method: "FALLBACK_MEAN",
      peakHour: null,
      peakVolume: 0,
      confidenceLabel: "0-0",
      coldStart: true,
    });
  });
});
