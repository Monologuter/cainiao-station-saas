<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import {
  Activity,
  AlertTriangle,
  Eye,
  PackageCheck,
  RotateCcw,
  Store,
  WalletCards,
  X,
} from "lucide-vue-next";
import {
  monitorStoreDetailApi,
  monitorStoresApi,
  type StoreMonitorRow,
} from "@/api/monitor";

const loading = ref(false);
const total = ref(0);
const stores = ref<StoreMonitorRow[]>([]);
const selected = ref<StoreMonitorRow | null>(null);

const warningCount = computed(
  () => stores.value.filter((item) => item.health.status !== "healthy").length,
);

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const result = await monitorStoresApi({ page: 1, pageSize: 50 });
    stores.value = result.items;
    total.value = result.total;
  } catch (error) {
    ElMessage.error(errorText(error, "加载门店监控失败"));
  } finally {
    loading.value = false;
  }
}

async function openDetail(row: StoreMonitorRow) {
  try {
    selected.value = await monitorStoreDetailApi(row.stationId);
  } catch (error) {
    ElMessage.error(errorText(error, "加载门店详情失败"));
  }
}

function errorText(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

function closeDetail() {
  selected.value = null;
}

function money(value: number) {
  return `¥${(value / 100).toFixed(2)}`;
}

function healthClass(status: string) {
  return status === "healthy" ? "green" : status === "warning" ? "amber" : "red";
}

function healthLabel(status: string) {
  const map: Record<string, string> = {
    healthy: "健康",
    warning: "预警",
    critical: "高危",
  };
  return map[status] ?? status;
}

function subscriptionClass(status?: string) {
  if (status === "ACTIVE" || status === "TRIALING") return "green";
  if (status === "SUSPENDED" || status === "CANCELED") return "red";
  return "amber";
}
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">运营 / 门店监控</div>
      <h1>门店监控</h1>
    </div>
    <div class="toolbar">
      <span class="tag" :class="warningCount ? 'amber' : 'green'">
        <span class="d"></span>{{ warningCount }} 个门店需关注
      </span>
      <button class="btn" type="button" :disabled="loading" @click="load">
        <RotateCcw />
        刷新
      </button>
    </div>
  </section>

  <section class="store-grid">
    <article v-for="item in stores" :key="item.stationId" class="store-card">
      <div class="store-card-hd">
        <div>
          <b>{{ item.stationName }}</b>
          <span>{{ item.tenantName }} · {{ item.stationCode }}</span>
        </div>
        <span class="tag" :class="healthClass(item.health.status)">
          <span class="d"></span>{{ healthLabel(item.health.status) }}
        </span>
      </div>
      <div class="store-metrics">
        <div><PackageCheck /> <b class="tnum">{{ item.metrics.inStockParcels }}</b><span>在库</span></div>
        <div><AlertTriangle /> <b class="tnum">{{ item.metrics.exceptionCount }}</b><span>异常</span></div>
        <div><WalletCards /> <b class="tnum">{{ money(item.metrics.gmv) }}</b><span>GMV</span></div>
      </div>
      <div class="store-card-ft">
        <span class="tag" :class="item.online ? 'green' : 'gray'">
          <span class="d"></span>{{ item.online ? "在线" : "离线" }}
        </span>
        <span class="tag" :class="subscriptionClass(item.subscription?.status)">
          {{ item.subscription?.status || "NO_SUBSCRIPTION" }}
        </span>
        <button class="btn btn-sm" type="button" @click="openDetail(item)">
          <Eye /> 下钻
        </button>
      </div>
    </article>
  </section>

  <section class="table-card">
    <div class="card-hd">
      <h2>门店明细</h2>
      <span class="muted">共 {{ total }} 个门店</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>门店</th>
          <th>健康</th>
          <th>订阅</th>
          <th>在库</th>
          <th>异常</th>
          <th>GMV</th>
          <th style="text-align: right">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in stores" :key="`${item.stationId}-row`">
          <td>
            <b>{{ item.stationName }}</b>
            <span class="muted store-line">{{ item.tenantName }}</span>
          </td>
          <td><span class="tag" :class="healthClass(item.health.status)">{{ healthLabel(item.health.status) }}</span></td>
          <td><span class="tag" :class="subscriptionClass(item.subscription?.status)">{{ item.subscription?.status || "未订阅" }}</span></td>
          <td class="tnum">{{ item.metrics.inStockParcels }}</td>
          <td class="tnum">{{ item.metrics.exceptionCount }}</td>
          <td class="tnum">{{ money(item.metrics.gmv) }}</td>
          <td style="text-align: right"><button type="button" class="op" @click="openDetail(item)">详情</button></td>
        </tr>
      </tbody>
    </table>
    <el-empty v-if="!loading && stores.length === 0" description="暂无门店数据" />
  </section>

  <div v-if="selected" class="mask" @click.self="closeDetail">
    <section class="modal store-modal">
      <div class="hd">
        <h3>{{ selected.stationName }}</h3>
        <button class="btn btn-ghost" type="button" @click="closeDetail"><X /></button>
      </div>
      <div class="bd store-detail">
        <div class="store-detail-kpi">
          <div><Store /> <b>{{ selected.tenantName }}</b><span>所属租户</span></div>
          <div><Activity /> <b>{{ healthLabel(selected.health.status) }}</b><span>健康状态</span></div>
          <div><PackageCheck /> <b>{{ selected.metrics.inStockParcels }}</b><span>在库包裹</span></div>
          <div><WalletCards /> <b>{{ money(selected.metrics.gmv) }}</b><span>寄件 GMV</span></div>
        </div>
        <dl class="review-dl">
          <dt>门店 ID</dt><dd>{{ selected.stationId }}</dd>
          <dt>租户 ID</dt><dd>{{ selected.tenantId }}</dd>
          <dt>订阅</dt><dd>{{ selected.subscription?.status || "未订阅" }}</dd>
          <dt>健康原因</dt><dd>{{ selected.health.reasons.join(" / ") || "无" }}</dd>
        </dl>
      </div>
      <div class="ft">
        <button class="btn" type="button" @click="closeDetail">关闭</button>
      </div>
    </section>
  </div>
</template>
