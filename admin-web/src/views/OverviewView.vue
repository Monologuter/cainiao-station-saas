<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
  BarChart3,
  Building2,
  PackageCheck,
  RotateCcw,
  Store,
  WalletCards,
} from "lucide-vue-next";
import {
  tenantCompareApi,
  type TenantCompare,
} from "@/api/analytics";
import { monitorOverviewApi, type MonitorOverview } from "@/api/monitor";

const today = new Date().toISOString().slice(0, 10);
const filters = reactive({ metric: "inbound", date: today });
const loading = ref(false);
const overview = ref<MonitorOverview>({
  tenants: 0,
  stations: 0,
  inStockParcels: 0,
  exceptionCount: 0,
  gmv: 0,
});
const compare = ref<TenantCompare>({ metric: "inbound", rows: [] });

const maxCompare = computed(() =>
  Math.max(1, ...compare.value.rows.map((row) => row.value)),
);
const kpis = computed(() => [
  {
    label: "租户数",
    value: overview.value.tenants,
    delta: "活跃商户",
    icon: Building2,
  },
  {
    label: "门店数",
    value: overview.value.stations,
    delta: "运营网点",
    icon: Store,
  },
  {
    label: "全平台包裹",
    value: overview.value.inStockParcels,
    delta: "当前在库",
    icon: PackageCheck,
  },
  {
    label: "异常总数",
    value: overview.value.exceptionCount,
    delta: "需巡检",
    icon: BarChart3,
  },
  {
    label: "寄件 GMV",
    value: money(overview.value.gmv),
    delta: "今日支付",
    icon: WalletCards,
  },
]);

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const [overviewRes, compareRes] = await Promise.all([
      monitorOverviewApi(),
      tenantCompareApi({
        metric: filters.metric,
        date: filters.date,
        limit: 10,
      }),
    ]);
    overview.value = overviewRes;
    compare.value = compareRes;
  } finally {
    loading.value = false;
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

function displayValue(metric: string, value: number) {
  return metric === "ship_gmv" ? money(value) : value;
}

function money(value: number) {
  return `¥${(value / 100).toFixed(2)}`;
}
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">运营 / 平台总览</div>
      <h1>平台总览</h1>
    </div>
    <div class="toolbar overview-actions">
      <input v-model="filters.date" class="input date-input" type="date" />
      <select v-model="filters.metric" class="input metric-select">
        <option value="inbound">入库量</option>
        <option value="pickup">取件量</option>
        <option value="ship_paid">寄件支付</option>
        <option value="ship_gmv">寄件 GMV</option>
      </select>
      <button
        class="btn btn-primary"
        type="button"
        :disabled="loading"
        @click="load"
      >
        <RotateCcw />
        刷新
      </button>
    </div>
  </section>

  <section class="overview-kpis">
    <article v-for="item in kpis" :key="item.label" class="kpi">
      <div class="lab">
        <i><component :is="item.icon" /></i>
        {{ item.label }}
      </div>
      <div class="num tnum">{{ item.value }}</div>
      <div class="delta">{{ item.delta }}</div>
    </article>
  </section>

  <section class="overview-grid">
    <article class="table-card compare-panel">
      <div class="card-hd">
        <h2>租户对比</h2>
        <span class="tag blue"
          ><span class="d"></span>{{ metricLabel(filters.metric) }}</span
        >
      </div>
      <table>
        <thead>
          <tr>
            <th>租户</th>
            <th>指标</th>
            <th>占比</th>
            <th>数值</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in compare.rows" :key="row.tenantId">
            <td>{{ row.name }}</td>
            <td>{{ metricLabel(filters.metric) }}</td>
            <td>
              <div class="bar-track">
                <i :style="{ width: `${(row.value / maxCompare) * 100}%` }"></i>
              </div>
            </td>
            <td class="tnum">{{ displayValue(filters.metric, row.value) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="compare.rows.length === 0" class="empty compact-empty">
        <p>暂无租户对比。</p>
      </div>
    </article>

    <article class="table-card">
      <div class="card-hd">
        <h2>运营健康</h2>
        <span class="tag green"><span class="d"></span>正常</span>
      </div>
      <div class="health-list">
        <div>
          <b>异常总数</b>
          <span class="tnum">{{ overview.exceptionCount }}</span>
        </div>
        <div>
          <b>在库包裹</b>
          <span class="tnum">{{ overview.inStockParcels }}</span>
        </div>
        <div>
          <b>租户门店比</b>
          <span class="tnum">{{
            overview.tenants
              ? (overview.stations / overview.tenants).toFixed(1)
              : "0.0"
          }}</span>
        </div>
      </div>
    </article>
  </section>
</template>
