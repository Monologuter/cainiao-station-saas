<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus/es/components/message/index";
import {
  BarChart3,
  Boxes,
  CalendarDays,
  Download,
  LineChart,
  PackageCheck,
  RotateCcw,
  TimerReset,
  TrendingUp,
} from "lucide-vue-next";
import {
  connectAnalyticsRealtime,
  type AnalyticsRealtimeConnection,
  type AnalyticsSnapshot,
} from "@/api/analytics-realtime";
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
  trendApi,
  type AnalyticsHeatmap,
  type AnalyticsOverview,
  type AnalyticsRanking,
  type AnalyticsTrend,
  type ReportJob,
  type StationCompare,
  type VolumeForecastItem,
} from "@/api/analytics";
import { forecastMethodLabel, reportStatusMeta } from "@/utils/status-labels";

const today = new Date().toISOString().slice(0, 10);
const tomorrow = offsetDate(today, 1);
const nextWeek = offsetDate(today, 7);
const weekStart = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
const iconMap = [PackageCheck, TimerReset, Boxes, TrendingUp, BarChart3];
const filters = reactive({
  stationId: localStorage.getItem("cn_station_id") ?? "",
  metric: "inbound",
  from: weekStart,
  to: today,
});
const loading = ref(false);
const reportLoading = ref(false);
const forecastLoading = ref(false);
const overview = ref<AnalyticsOverview>({
  inbound: 0,
  pickup: 0,
  stored: 0,
  pickupRate: 0,
  overdueCount: 0,
  exceptionCount: 0,
  shipPaid: 0,
  gmv: 0,
  notifyToday: 0,
});
const trend = ref<AnalyticsTrend>({ metric: "inbound", points: [] });
const ranking = ref<AnalyticsRanking>({ type: "overdue", items: [] });
const heatmap = ref<AnalyticsHeatmap>({ shelves: [] });
const compare = ref<StationCompare>({ metric: "inbound", rows: [] });
const forecast = ref<VolumeForecastItem[]>([]);
const hourForecast = ref<VolumeForecastItem[]>([]);
const report = ref<ReportJob | null>(null);
let realtime: AnalyticsRealtimeConnection | undefined;
let realtimeRefreshTimer: number | undefined;

const decoratedKpis = computed(() =>
  overviewToKpis(overview.value).map((item, index) => ({
    ...item,
    icon: iconMap[index],
  })),
);
const maxTrend = computed(() =>
  Math.max(1, ...trend.value.points.map((item) => item.value)),
);
const maxForecast = computed(() =>
  Math.max(
    1,
    ...forecast.value.flatMap((item) => [
      item.predictedVolume,
      item.upperBound,
      item.actualVolume ?? 0,
    ]),
  ),
);
const forecastInfo = computed(() => forecastSummary(forecast.value));
const hourInfo = computed(() => forecastSummary(hourForecast.value));
const hourBars = computed(() => {
  const hours = hourForecast.value.find((item) => item.hourBreakdown?.length)?.hourBreakdown ?? [];
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    value: Number(hours[hour] ?? 0),
  }));
});
const maxHour = computed(() => Math.max(1, ...hourBars.value.map((item) => item.value)));
const maxCompare = computed(() =>
  Math.max(1, ...compare.value.rows.map((item) => item.value)),
);
const heatUsage = computed(() => {
  const capacity = heatmap.value.shelves.reduce(
    (sum, item) => sum + item.capacity,
    0,
  );
  const used = heatmap.value.shelves.reduce((sum, item) => sum + item.used, 0);
  return {
    used,
    capacity,
    rate: capacity ? Math.round((used / capacity) * 100) : 0,
  };
});

onMounted(() => {
  load();
  realtime = connectAnalyticsRealtime({
    stationId: filters.stationId || undefined,
    onSnapshot: applyRealtimeSnapshot,
    onMetric: scheduleRealtimeRefresh,
    onParcelStored: scheduleRealtimeRefresh,
  });
});

onUnmounted(() => {
  realtime?.disconnect();
  if (realtimeRefreshTimer) {
    window.clearTimeout(realtimeRefreshTimer);
  }
});

async function load() {
  loading.value = true;
  try {
    await loadQuietly();
  } finally {
    loading.value = false;
  }
}

async function loadQuietly() {
  const query = { stationId: filters.stationId };
  const [overviewRes, trendRes, rankingRes, heatmapRes, compareRes, forecastRes, hourForecastRes] =
    await Promise.all([
      overviewApi(query),
      trendApi({
        stationId: filters.stationId,
        metric: filters.metric,
        from: filters.from,
        to: filters.to,
      }),
      rankingApi({ type: "overdue", stationId: filters.stationId, limit: 8 }),
      heatmapApi(query),
      stationCompareApi({ metric: filters.metric, date: filters.to, limit: 8 }),
      forecastVolumeApi({
        stationId: filters.stationId,
        from: tomorrow,
        to: nextWeek,
        granularity: "DAY",
      }),
      forecastVolumeApi({
        stationId: filters.stationId,
        from: tomorrow,
        to: tomorrow,
        granularity: "HOUR",
      }),
    ]);
  overview.value = overviewRes;
  trend.value = trendRes;
  ranking.value = rankingRes;
  heatmap.value = heatmapRes;
  compare.value = compareRes;
  forecast.value = forecastRes.items;
  hourForecast.value = hourForecastRes.items;
}

function applyRealtimeSnapshot(payload: AnalyticsSnapshot) {
  if (payload.overview) {
    overview.value = payload.overview;
  }
  if (payload.ranking) {
    ranking.value = payload.ranking;
  }
}

function scheduleRealtimeRefresh() {
  if (realtimeRefreshTimer) {
    return;
  }
  realtimeRefreshTimer = window.setTimeout(async () => {
    realtimeRefreshTimer = undefined;
    await loadQuietly();
  }, 300);
}

async function refreshForecast() {
  if (!filters.stationId) {
    ElMessage.error("请先填写门店 ID");
    return;
  }
  forecastLoading.value = true;
  try {
    await Promise.all([
      runForecastApi({ stationId: filters.stationId, horizon: 7, granularity: "DAY" }),
      runForecastApi({ stationId: filters.stationId, horizon: 1, granularity: "HOUR" }),
    ]);
    await loadQuietly();
    ElMessage.success("预测已重算");
  } finally {
    forecastLoading.value = false;
  }
}

async function exportReport() {
  reportLoading.value = true;
  try {
    const created = await createAnalyticsReportApi({
      type: "daily_summary",
      format: "csv",
      from: filters.from,
      to: filters.to,
      stationId: filters.stationId || undefined,
    });
    report.value = created;
    const jobId = created.jobId ?? created.id;
    if (jobId) {
      report.value = await getAnalyticsReportApi(jobId);
    }
    ElMessage.success("报表已生成");
  } finally {
    reportLoading.value = false;
  }
}

function metricLabel(metric: string) {
  const labels: Record<string, string> = {
    inbound: "入库量",
    pickup: "取件量",
    ship_paid: "寄件支付",
    ship_gmv: "寄件 GMV",
  };
  return labels[metric] ?? metric;
}

function money(value?: number) {
  return `¥${((value ?? 0) / 100).toFixed(2)}`;
}

function offsetDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">网点管理 / 经营统计</div>
      <h1>经营统计</h1>
    </div>
    <div class="toolbar analytics-actions">
      <input
        v-model.trim="filters.stationId"
        class="input station-input"
        placeholder="门店 ID"
      />
      <select v-model="filters.metric" class="input metric-select">
        <option value="inbound">入库量</option>
        <option value="pickup">取件量</option>
        <option value="ship_paid">寄件支付</option>
        <option value="ship_gmv">寄件 GMV</option>
      </select>
      <button class="btn" type="button" :disabled="loading" @click="load">
        <RotateCcw />
        刷新
      </button>
      <button
        class="btn"
        type="button"
        :disabled="forecastLoading"
        @click="refreshForecast"
      >
        <CalendarDays />
        重算预测
      </button>
      <button
        class="btn btn-primary"
        type="button"
        :disabled="reportLoading"
        @click="exportReport"
      >
        <Download />
        导出
      </button>
    </div>
  </section>

  <section class="analytics-kpis">
    <article
      v-for="item in decoratedKpis"
      :key="item.label"
      class="kpi"
      :class="{ warn: item.warn }"
    >
      <div class="lab">
        <i><component :is="item.icon" /></i>
        {{ item.label }}
      </div>
      <div class="num tnum">{{ item.value }}</div>
      <div class="delta">{{ item.delta }}</div>
    </article>
  </section>

  <section class="analytics-grid">
    <article class="table-card trend-panel">
      <div class="card-hd">
        <h2>{{ metricLabel(filters.metric) }}趋势</h2>
        <span class="tag blue"
          ><span class="d"></span>{{ filters.from }} 至 {{ filters.to }}</span
        >
      </div>
      <div class="trend-chart">
        <div v-for="point in trend.points" :key="point.date" class="trend-bar">
          <span class="bar-value tnum">{{ point.value }}</span>
          <i
            :style="{
              height: `${Math.max(8, (point.value / maxTrend) * 150)}px`,
            }"
          ></i>
          <b>{{ point.date.slice(5) }}</b>
        </div>
      </div>
    </article>

    <article class="table-card forecast-panel">
      <div class="card-hd">
        <h2>包裹量预测</h2>
        <span class="tag" :class="forecastInfo.coldStart ? 'amber' : 'green'">
          <span class="d"></span>{{ forecastMethodLabel(forecastInfo.method) }}
        </span>
      </div>
      <div class="forecast-summary">
        <div>
          <span>未来 7 日</span>
          <b class="tnum">{{ forecastInfo.total }}</b>
        </div>
        <div>
          <span>置信区间</span>
          <b class="tnum">{{ forecastInfo.confidenceLabel }}</b>
        </div>
        <div>
          <span>明日峰值</span>
          <b class="tnum">
            {{ hourInfo.peakHour === null ? '--' : `${hourInfo.peakHour}:00` }}
          </b>
        </div>
      </div>
      <div class="forecast-chart">
        <div v-for="item in forecast" :key="item.targetDate" class="forecast-bar">
          <span class="bar-value tnum">{{ item.predictedVolume }}</span>
          <i
            class="range"
            :style="{
              height: `${Math.max(10, (item.upperBound / maxForecast) * 150)}px`,
            }"
          ></i>
          <i
            class="predicted"
            :style="{
              height: `${Math.max(8, (item.predictedVolume / maxForecast) * 150)}px`,
            }"
          ></i>
          <b>{{ item.targetDate.slice(5) }}</b>
        </div>
        <div v-if="forecast.length === 0" class="empty compact-empty">
          <p>暂无预测结果，可点击重算预测。</p>
        </div>
      </div>
    </article>

    <article class="table-card hour-panel">
      <div class="card-hd">
        <h2>明日时段高峰</h2>
        <span class="muted">峰值 {{ hourInfo.peakVolume }}</span>
      </div>
      <div class="hour-heat">
        <div
          v-for="item in hourBars"
          :key="item.hour"
          class="hour-cell"
          :style="{ '--hour-alpha': `${Math.min(0.85, item.value / maxHour) * 100}%` }"
        >
          <i></i>
          <b>{{ item.hour }}</b>
        </div>
      </div>
    </article>

    <article class="table-card report-panel">
      <div class="card-hd">
        <h2>报表任务</h2>
        <LineChart />
      </div>
      <div class="report-body">
        <div>
          <span class="tag" :class="reportStatusMeta(report?.status).tag">
            <span class="d"></span>{{ reportStatusMeta(report?.status).label }}
          </span>
          <p>{{ report?.downloadUrl ?? "daily_summary.csv" }}</p>
        </div>
        <a
          v-if="report?.downloadUrl"
          class="btn btn-accent"
          :href="report.downloadUrl"
        >
          <Download />
          下载
        </a>
        <button
          v-else
          class="btn"
          type="button"
          :disabled="reportLoading"
          @click="exportReport"
        >
          <Download />
          生成
        </button>
      </div>
    </article>

    <article class="table-card">
      <div class="card-hd">
        <h2>滞留排行</h2>
        <span class="muted">Top {{ ranking.items.length }}</span>
      </div>
      <div class="rank-list">
        <div
          v-for="(item, index) in ranking.items"
          :key="item.key"
          class="rank-row"
        >
          <b class="tnum">{{ index + 1 }}</b>
          <span>{{ item.label }}</span>
          <i></i>
          <strong class="tnum">{{ item.value }}</strong>
        </div>
        <div v-if="ranking.items.length === 0" class="empty compact-empty">
          <p>暂无滞留排行。</p>
        </div>
      </div>
    </article>

    <article class="table-card">
      <div class="card-hd">
        <h2>货架热力</h2>
        <span class="tag" :class="heatUsage.rate > 85 ? 'red' : 'blue'">
          <span class="d"></span>{{ heatUsage.used }}/{{ heatUsage.capacity }}
        </span>
      </div>
      <div class="heat-grid">
        <div
          v-for="shelf in heatmap.shelves"
          :key="shelf.shelfCode"
          class="heat-cell"
        >
          <b>{{ shelf.shelfCode }}</b>
          <span class="tnum">{{ Math.round(shelf.rate * 100) }}%</span>
          <i :style="{ width: `${Math.round(shelf.rate * 100)}%` }"></i>
        </div>
        <div v-if="heatmap.shelves.length === 0" class="empty compact-empty">
          <p>暂无货架数据。</p>
        </div>
      </div>
    </article>

    <article class="table-card compare-panel">
      <div class="card-hd">
        <h2>门店对比</h2>
        <span class="muted">{{ metricLabel(filters.metric) }}</span>
      </div>
      <div class="compare-list">
        <div
          v-for="row in compare.rows"
          :key="row.stationId"
          class="compare-row"
        >
          <span>{{ row.name }}</span>
          <div>
            <i :style="{ width: `${(row.value / maxCompare) * 100}%` }"></i>
          </div>
          <b class="tnum">{{
            filters.metric === "ship_gmv" ? money(row.value) : row.value
          }}</b>
        </div>
        <div v-if="compare.rows.length === 0" class="empty compact-empty">
          <p>暂无门店对比。</p>
        </div>
      </div>
    </article>
  </section>
</template>

<style scoped>
.analytics-actions {
  margin-bottom: 0;
}

.station-input {
  width: 220px;
}

.metric-select {
  width: 132px;
}

.analytics-kpis {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 18px;
}

.analytics-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(300px, 0.8fr);
  gap: 18px;
  align-items: start;
}

.trend-panel,
.compare-panel,
.forecast-panel {
  grid-column: span 1;
}

.trend-chart {
  display: grid;
  grid-template-columns: repeat(7, minmax(44px, 1fr));
  align-items: end;
  gap: 12px;
  min-height: 230px;
  padding: 22px 18px 18px;
}

.trend-bar {
  display: grid;
  align-items: end;
  justify-items: center;
  gap: 8px;
  min-width: 0;
}

.trend-bar i {
  width: 100%;
  max-width: 34px;
  border-radius: 9px 9px 4px 4px;
  background: linear-gradient(180deg, var(--primary), var(--accent));
}

.trend-bar b,
.bar-value {
  color: var(--muted);
  font-size: 11.5px;
  font-weight: 600;
}

.forecast-panel {
  grid-column: span 1;
}

.forecast-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 16px 18px 0;
}

.forecast-summary div {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.forecast-summary span,
.forecast-summary b {
  display: block;
}

.forecast-summary span {
  color: var(--muted);
  font-size: 12px;
}

.forecast-summary b {
  margin-top: 6px;
  overflow: hidden;
  color: var(--text);
  font-size: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.forecast-chart {
  display: grid;
  grid-template-columns: repeat(7, minmax(44px, 1fr));
  align-items: end;
  gap: 12px;
  min-height: 230px;
  padding: 22px 18px 18px;
}

.forecast-bar {
  position: relative;
  display: grid;
  align-items: end;
  justify-items: center;
  gap: 8px;
  min-width: 0;
}

.forecast-bar .range,
.forecast-bar .predicted {
  grid-row: 2;
  grid-column: 1;
  align-self: end;
  border-radius: 9px 9px 4px 4px;
}

.forecast-bar .range {
  width: 100%;
  max-width: 38px;
  background: var(--primary-soft);
  border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
}

.forecast-bar .predicted {
  width: 62%;
  max-width: 24px;
  background: linear-gradient(180deg, var(--accent), var(--primary));
}

.forecast-bar b {
  color: var(--muted);
  font-size: 11.5px;
  font-weight: 600;
}

.hour-panel {
  min-width: 0;
}

.hour-heat {
  display: grid;
  grid-template-columns: repeat(12, minmax(20px, 1fr));
  gap: 8px;
  padding: 18px;
}

.hour-cell {
  display: grid;
  gap: 6px;
  justify-items: center;
  min-width: 0;
}

.hour-cell i {
  width: 100%;
  height: 34px;
  border: 1px solid color-mix(in srgb, var(--warn) 18%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--warn) var(--hour-alpha), transparent);
}

.hour-cell b {
  color: var(--muted);
  font-size: 10.5px;
  font-weight: 600;
}

.report-panel svg {
  width: 18px;
  height: 18px;
  color: var(--primary);
}

.report-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px;
}

.report-body p {
  max-width: 260px;
  margin-top: 8px;
  color: var(--muted);
  font-size: 12.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-list,
.compare-list,
.heat-grid {
  display: grid;
  gap: 10px;
  padding: 16px 18px 18px;
}

.rank-row,
.compare-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 92px 70px;
  align-items: center;
  gap: 10px;
  min-height: 34px;
}

.rank-row b {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: var(--primary-soft);
  color: var(--primary);
}

.rank-row span,
.compare-row span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-row i {
  height: 1px;
  background: var(--border);
}

.rank-row strong {
  text-align: right;
  color: var(--muted);
  font-size: 12px;
}

.heat-cell {
  position: relative;
  overflow: hidden;
  min-height: 52px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.heat-cell b,
.heat-cell span {
  position: relative;
  z-index: 1;
}

.heat-cell span {
  float: right;
  color: var(--muted);
  font-size: 12px;
}

.heat-cell i {
  position: absolute;
  inset: auto 0 0 0;
  height: 5px;
  background: var(--primary);
}

.compare-row {
  grid-template-columns: minmax(0, 120px) minmax(90px, 1fr) 82px;
}

.compare-row div {
  height: 8px;
  overflow: hidden;
  border-radius: 9px;
  background: var(--border-2);
}

.compare-row i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--primary);
}

.compare-row b {
  text-align: right;
}

.compact-empty {
  padding: 22px;
}

@media (max-width: 1180px) {
  .analytics-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .analytics-grid {
    grid-template-columns: 1fr;
  }

  .hour-heat {
    grid-template-columns: repeat(8, minmax(20px, 1fr));
  }
}
</style>
