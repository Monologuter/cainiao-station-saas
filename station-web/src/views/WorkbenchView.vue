<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  BadgeCheck,
  Box,
  ClockAlert,
  PackageCheck,
  ScanLine,
} from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { overviewApi, overviewToKpis, type DashboardKpi } from '@/api/analytics';
import { listParcelsApi, parcelStatusMeta, type ParcelItem } from '@/api/parcel';

const router = useRouter();
const iconMap = [ScanLine, PackageCheck, Box, BadgeCheck, ClockAlert];
const kpis = ref<DashboardKpi[]>(overviewToKpis({
  inboundToday: 0,
  pickedToday: 0,
  inStock: 0,
  pickupRate: 0,
  overdueCount: 0,
  notifyToday: 0,
}));
const recent = ref<ParcelItem[]>([]);

const decoratedKpis = computed(() =>
  kpis.value.map((item, index) => ({
    ...item,
    icon: iconMap[index],
  })),
);

onMounted(async () => {
  const [overview, parcels] = await Promise.all([
    overviewApi(),
    listParcelsApi({ status: 'STORED', page: 1, size: 5 }),
  ]);
  kpis.value = overviewToKpis(overview);
  recent.value = parcels.list;
});

function formatTime(value?: string | null) {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function go(path: string) {
  router.push(path);
}
</script>

<template>
  <section class="kpi-row">
    <article v-for="item in decoratedKpis" :key="item.label" class="kpi" :class="{ warn: item.warn }">
      <div class="lab">
        <i><component :is="item.icon" /></i>
        {{ item.label }}
      </div>
      <div class="num tnum">{{ item.value }}</div>
      <div class="delta">{{ item.delta }}</div>
    </article>
  </section>

  <section class="shell-grid">
    <div class="table-card">
      <div class="card-hd">
        <h2>最近入库</h2>
        <button class="link link-button" type="button" @click="go('/parcels')">查看全部</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>取件码</th>
            <th>运单号</th>
            <th>手机尾号</th>
            <th>快递</th>
            <th>货位</th>
            <th>状态</th>
            <th>入库时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="parcel in recent" :key="parcel.id">
            <td class="code">{{ parcel.pickupCode ?? '-' }}</td>
            <td>{{ parcel.waybillNo }}</td>
            <td>{{ parcel.receiverPhoneTail }}</td>
            <td>{{ parcel.carrier ?? '-' }}</td>
            <td>{{ parcel.slot?.code ?? '-' }}</td>
            <td>
              <span class="tag" :class="parcelStatusMeta(parcel.status).tag">
                <span class="d"></span>
                {{ parcelStatusMeta(parcel.status).label }}
              </span>
            </td>
            <td>{{ formatTime(parcel.storedAt) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="recent.length === 0" class="empty compact-empty">
        <p>暂无最近入库。</p>
      </div>
    </div>

    <aside class="quick-panel">
      <button class="qbtn qbtn-primary" type="button" data-testid="quick-inbound" @click="go('/inbound')">
        <ScanLine />
        <span>
          <b>扫码入库</b>
          <small>扫码枪 / 手动录入</small>
        </span>
      </button>
      <button class="qbtn qbtn-accent" type="button" data-testid="quick-pickup" @click="go('/pickup')">
        <BadgeCheck />
        <span>
          <b>取件核销</b>
          <small>取件码 / 手机尾号</small>
        </span>
      </button>
    </aside>
  </section>
</template>
