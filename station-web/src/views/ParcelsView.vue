<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  PackageSearch,
  RotateCcw,
  Search,
  X,
} from 'lucide-vue-next';
import { createParcelExceptionApi } from '@/api/exceptions';
import {
  eventTypeLabel,
  listParcelsApi,
  parcelDetailApi,
  parcelStatusMeta,
  type ParcelItem,
  type ParcelQuery,
  type ParcelStatus,
} from '@/api/parcel';

const filters = reactive<Required<Pick<ParcelQuery, 'status' | 'phoneTail' | 'pickupCode' | 'slot'>>>({
  status: '',
  phoneTail: '',
  pickupCode: '',
  slot: '',
});
const page = ref(1);
const size = ref(10);
const total = ref(0);
const loading = ref(false);
const rows = ref<ParcelItem[]>([]);
const detail = ref<ParcelItem | null>(null);
const detailLoading = ref(false);

const tabs: Array<{ label: string; status: ParcelStatus | '' }> = [
  { label: '全部', status: '' },
  { label: '在库', status: 'STORED' },
  { label: '已取', status: 'PICKED_UP' },
  { label: '异常', status: 'EXCEPTION' },
];

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / size.value)));

onMounted(() => {
  load();
});

async function load() {
  loading.value = true;
  try {
    const result = await listParcelsApi({
      ...filters,
      page: page.value,
      size: size.value,
    });
    rows.value = result.list;
    total.value = result.total;
    page.value = result.page;
    size.value = result.size;
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  filters.phoneTail = '';
  filters.pickupCode = '';
  filters.slot = '';
  filters.status = '';
  page.value = 1;
  load();
}

function switchStatus(status: ParcelStatus | '') {
  filters.status = status;
  page.value = 1;
  load();
}

function submitFilters() {
  page.value = 1;
  load();
}

async function openDetail(parcel: ParcelItem) {
  detailLoading.value = true;
  detail.value = parcel;
  try {
    detail.value = await parcelDetailApi(parcel.id);
  } catch {
    ElMessage.error('包裹详情加载失败');
  } finally {
    detailLoading.value = false;
  }
}

async function markException(parcel: ParcelItem) {
  const description = window.prompt('请输入异常说明', '包裹异常待处理');
  if (!description) {
    return;
  }
  await createParcelExceptionApi(parcel.id, {
    type: 'DAMAGED',
    description,
  });
  ElMessage.success('已标记异常件');
  await load();
}

function changePage(next: number) {
  if (next < 1 || next > pageCount.value || next === page.value) {
    return;
  }
  page.value = next;
  load();
}

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
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">代收业务 / 在库包裹</div>
      <h1>在库包裹</h1>
    </div>
    <button class="btn" type="button" @click="load">
      <RotateCcw />
      刷新
    </button>
  </section>

  <form class="toolbar" @submit.prevent="submitFilters">
    <label class="search-box">
      <Search />
      <input v-model.trim="filters.phoneTail" placeholder="手机尾号" />
    </label>
    <input v-model.trim="filters.pickupCode" class="input compact-input" placeholder="取件码" />
    <input v-model.trim="filters.slot" class="input compact-input" placeholder="库位号" />
    <button class="btn btn-primary" type="submit">
      <PackageSearch />
      查询
    </button>
    <button class="btn btn-ghost" type="button" @click="resetFilters">重置</button>
  </form>

  <div class="tabs">
    <button
      v-for="tab in tabs"
      :key="tab.label"
      class="tab"
      :class="{ on: filters.status === tab.status }"
      type="button"
      @click="switchStatus(tab.status)"
    >
      {{ tab.label }}
    </button>
  </div>

  <section class="table-card">
    <table>
      <thead>
        <tr>
          <th>取件码</th>
          <th>运单号</th>
          <th>手机尾号</th>
          <th>库位</th>
          <th>状态</th>
          <th>入库时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="parcel in rows" :key="parcel.id">
          <td class="code">{{ parcel.pickupCode ?? '-' }}</td>
          <td class="tnum">{{ parcel.waybillNo }}</td>
          <td>{{ parcel.receiverPhoneTail }}</td>
          <td>{{ parcel.slot?.code ?? '-' }}</td>
          <td>
            <span class="tag" :class="parcelStatusMeta(parcel.status).tag">
              <span class="d"></span>
              {{ parcelStatusMeta(parcel.status).label }}
            </span>
          </td>
          <td>{{ formatTime(parcel.storedAt ?? parcel.createdAt) }}</td>
          <td>
            <div class="row-actions">
              <button class="op op-btn" type="button" @click="openDetail(parcel)">详情</button>
              <button
                v-if="parcel.status === 'STORED'"
                class="op op-btn danger"
                type="button"
                @click="markException(parcel)"
              >
                <AlertTriangle />
                异常
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!loading && rows.length === 0" class="empty compact-empty">
      <p>暂无匹配包裹。</p>
    </div>
    <div class="pager">
      <span class="total">共 {{ total }} 条</span>
      <button class="pg nav-pg" type="button" @click="changePage(page - 1)">
        <ChevronLeft />
      </button>
      <button class="pg on" type="button">{{ page }}</button>
      <button class="pg nav-pg" type="button" @click="changePage(page + 1)">
        <ChevronRight />
      </button>
    </div>
  </section>

  <div v-if="detail" class="drawer parcel-drawer">
    <div class="drawer-hd">
      <div>
        <span class="muted">包裹详情</span>
        <h2>{{ detail.pickupCode ?? detail.waybillNo }}</h2>
      </div>
      <button class="ibtn" type="button" aria-label="关闭" @click="detail = null">
        <X />
      </button>
    </div>
    <div class="drawer-bd">
      <div class="pickup-hero-lite">
        <span class="tag" :class="parcelStatusMeta(detail.status).tag">
          <span class="d"></span>
          {{ parcelStatusMeta(detail.status).label }}
        </span>
        <div class="pickup-code tnum">{{ detail.pickupCode ?? '-' }}</div>
        <p>{{ detail.station?.name ?? '当前门店' }} · {{ detail.slot?.code ?? '未分配库位' }}</p>
      </div>

      <div class="info-grid parcel-info-grid">
        <div class="cell">
          <div class="k">运单号</div>
          <div class="v">{{ detail.waybillNo }}</div>
        </div>
        <div class="cell">
          <div class="k">手机尾号</div>
          <div class="v">{{ detail.receiverPhoneTail }}</div>
        </div>
        <div class="cell">
          <div class="k">入库时间</div>
          <div class="v">{{ formatTime(detail.storedAt) }}</div>
        </div>
        <div class="cell">
          <div class="k">取件时间</div>
          <div class="v">{{ formatTime(detail.pickedUpAt) }}</div>
        </div>
      </div>

      <section class="timeline-lite">
        <h3>生命周期</h3>
        <div v-if="detailLoading" class="empty compact-empty">
          <p>加载中...</p>
        </div>
        <div v-else>
          <div v-for="event in detail.events ?? []" :key="event.id" class="timeline-row">
            <span class="timeline-dot"></span>
            <div>
              <b>{{ eventTypeLabel(event.eventType) }}</b>
              <p>{{ event.fromStatus ?? '-' }} → {{ event.toStatus }} · {{ formatTime(event.createdAt) }}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
