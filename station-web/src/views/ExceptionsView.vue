<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index';
import { AlertTriangle, BadgeCheck, RotateCcw, Search, Undo2 } from 'lucide-vue-next';
import {
  claimExceptionApi,
  exceptionStatusMeta,
  exceptionTypeMeta,
  listExceptionsApi,
  resolveExceptionApi,
  type ExceptionQuery,
  type ExceptionStatus,
  type ExceptionTicket,
  type ExceptionType,
} from '@/api/exceptions';
import {
  listOverdueParcelsApi,
  overdueLevelMeta,
  runOverdueScanApi,
  type OverdueParcel,
} from '@/api/overdue';

const filters = reactive<Required<Pick<ExceptionQuery, 'status' | 'type' | 'keyword'>>>({
  status: '',
  type: '',
  keyword: '',
});
const page = ref(1);
const size = ref(10);
const total = ref(0);
const loading = ref(false);
const scanLoading = ref(false);
const rows = ref<ExceptionTicket[]>([]);
const overdueRows = ref<OverdueParcel[]>([]);

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / size.value)));

const statuses: Array<{ label: string; value: ExceptionStatus | '' }> = [
  { label: '全部', value: '' },
  { label: '待处理', value: 'OPEN' },
  { label: '处理中', value: 'IN_PROGRESS' },
  { label: '已解决', value: 'RESOLVED' },
];
const types: Array<{ label: string; value: ExceptionType | '' }> = [
  { label: '全部类型', value: '' },
  { label: '破损', value: 'DAMAGED' },
  { label: '错件', value: 'MISDELIVERED' },
  { label: '无主件', value: 'UNCLAIMED' },
  { label: '拒收', value: 'REJECTED' },
  { label: '超大件', value: 'OVERSIZED' },
];

onMounted(() => {
  load();
  loadOverdue();
});

async function load() {
  loading.value = true;
  try {
    const result = await listExceptionsApi({
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

async function loadOverdue() {
  const result = await listOverdueParcelsApi({ page: 1, size: 8 });
  overdueRows.value = result.list;
}

function submitFilters() {
  page.value = 1;
  load();
}

async function claim(ticket: ExceptionTicket) {
  await claimExceptionApi(ticket.id);
  ElMessage.success('已认领异常件');
  load();
}

async function resolve(ticket: ExceptionTicket, resolution: 'RESTOCK' | 'RETURN') {
  await resolveExceptionApi(ticket.id, {
    resolution,
    note: resolution === 'RESTOCK' ? '异常解除，重新入库' : '异常处理退回',
  });
  ElMessage.success(resolution === 'RESTOCK' ? '已重新入库' : '已退回');
  load();
  loadOverdue();
}

async function runScan() {
  scanLoading.value = true;
  try {
    const result = await runOverdueScanApi();
    ElMessage.success(`扫描 ${result.scanned} 件，升级 ${result.upgraded} 件，退回 ${result.returned} 件`);
    await Promise.all([load(), loadOverdue()]);
  } finally {
    scanLoading.value = false;
  }
}

function changePage(next: number) {
  if (next < 1 || next > pageCount.value || next === page.value) return;
  page.value = next;
  load();
}

function formatTime(value?: string | null) {
  if (!value) return '-';
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
      <div class="crumb">代收业务 / 异常件</div>
      <h1>异常件</h1>
    </div>
    <button class="btn" type="button" :disabled="loading" @click="load">
      <RotateCcw />
      刷新
    </button>
  </section>

  <section class="exception-grid">
    <article class="table-card">
      <div class="card-hd">
        <h2>滞留催取</h2>
        <button class="btn btn-primary" type="button" :disabled="scanLoading" @click="runScan">
          <AlertTriangle />
          手动扫描
        </button>
      </div>
      <div class="overdue-list">
        <div v-for="parcel in overdueRows" :key="parcel.id" class="overdue-row">
          <span class="tag" :class="overdueLevelMeta(parcel.overdueLevel).tag">
            <span class="d"></span>
            {{ overdueLevelMeta(parcel.overdueLevel).label }}
          </span>
          <div>
            <b>{{ parcel.pickupCode ?? parcel.waybillNo }}</b>
            <p>{{ parcel.daysOverdue }} 天 · {{ parcel.slot?.code ?? '-' }}</p>
          </div>
        </div>
        <div v-if="overdueRows.length === 0" class="empty compact-empty">
          <p>暂无滞留包裹。</p>
        </div>
      </div>
    </article>

    <article class="table-card">
      <div class="card-hd">
        <h2>异常工单</h2>
        <span class="muted">共 {{ total }} 条</span>
      </div>

      <form class="toolbar exception-toolbar" @submit.prevent="submitFilters">
        <label class="search-box">
          <Search />
          <input v-model.trim="filters.keyword" placeholder="工单号 / 运单号 / 描述" />
        </label>
        <select v-model="filters.status" class="input compact-input">
          <option v-for="item in statuses" :key="item.label" :value="item.value">
            {{ item.label }}
          </option>
        </select>
        <select v-model="filters.type" class="input compact-input">
          <option v-for="item in types" :key="item.label" :value="item.value">
            {{ item.label }}
          </option>
        </select>
        <button class="btn btn-primary" type="submit">
          <Search />
          查询
        </button>
      </form>

      <table>
        <thead>
          <tr>
            <th>工单</th>
            <th>类型</th>
            <th>包裹</th>
            <th>状态</th>
            <th>描述</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ticket in rows" :key="ticket.id">
            <td class="tnum">{{ ticket.code }}</td>
            <td>
              <span class="tag" :class="exceptionTypeMeta(ticket.type).tag">
                <span class="d"></span>
                {{ exceptionTypeMeta(ticket.type).label }}
              </span>
            </td>
            <td>{{ ticket.parcel?.waybillNo ?? '-' }}</td>
            <td>
              <span class="tag" :class="exceptionStatusMeta(ticket.status).tag">
                <span class="d"></span>
                {{ exceptionStatusMeta(ticket.status).label }}
              </span>
            </td>
            <td>{{ ticket.description }}</td>
            <td>{{ formatTime(ticket.createdAt) }}</td>
            <td class="row-actions">
              <button
                v-if="ticket.status === 'OPEN'"
                class="op op-btn"
                type="button"
                @click="claim(ticket)"
              >
                认领
              </button>
              <button
                v-if="ticket.status === 'IN_PROGRESS'"
                class="op op-btn"
                type="button"
                @click="resolve(ticket, 'RESTOCK')"
              >
                <Undo2 />
                归位
              </button>
              <button
                v-if="ticket.status === 'IN_PROGRESS'"
                class="op op-btn danger"
                type="button"
                @click="resolve(ticket, 'RETURN')"
              >
                <BadgeCheck />
                退回
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!loading && rows.length === 0" class="empty compact-empty">
        <p>暂无异常工单。</p>
      </div>
      <div class="pager">
        <span class="total">共 {{ total }} 条</span>
        <button class="pg nav-pg" type="button" @click="changePage(page - 1)">‹</button>
        <button class="pg on" type="button">{{ page }}</button>
        <button class="pg nav-pg" type="button" @click="changePage(page + 1)">›</button>
      </div>
    </article>
  </section>
</template>
