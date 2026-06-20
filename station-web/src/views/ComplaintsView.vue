<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index';
import { ElEmpty } from 'element-plus/es/components/empty/index';
import { CircleCheck, RotateCcw, Wrench } from 'lucide-vue-next';
import {
  complaintStatusMeta,
  handleComplaintApi,
  listComplaintsApi,
  type ComplaintItem,
  type ComplaintStatus,
} from '@/api/review';

const rows = ref<ComplaintItem[]>([]);
const total = ref(0);
const loading = ref(false);
const page = ref(1);
const size = 20;
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / size)));

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const result = await listComplaintsApi({ page: page.value, size });
    rows.value = result.list;
    total.value = result.total;
    normalizePage();
  } finally {
    loading.value = false;
  }
}

async function changePage(next: number) {
  page.value = Math.min(Math.max(1, next), pageCount.value);
  await load();
}

function normalizePage() {
  if (page.value > pageCount.value) {
    page.value = pageCount.value;
  }
}

async function transit(row: ComplaintItem, status: ComplaintStatus, note: string) {
  await handleComplaintApi(row.id, { status, note });
  ElMessage.success('投诉状态已更新');
  load();
}
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">会员运营 / 投诉</div>
      <h1>投诉处理</h1>
    </div>
    <button class="btn" type="button" :disabled="loading" @click="load">
      <RotateCcw />
      刷新
    </button>
  </section>

  <article class="table-card">
    <div class="card-hd">
      <h2>投诉工单</h2>
      <span class="muted">共 {{ total }} 条</span>
    </div>
    <el-empty v-if="!loading && rows.length === 0" description="暂无投诉工单" />
    <table v-else>
      <thead>
        <tr>
          <th>手机号</th>
          <th>类型</th>
          <th>内容</th>
          <th>状态</th>
          <th>处理记录</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td>{{ row.consumerPhone }}</td>
          <td>{{ row.type }}</td>
          <td>{{ row.content }}</td>
          <td>
            <span class="tag" :class="complaintStatusMeta(row.status).tag">
              <span class="d"></span>
              {{ complaintStatusMeta(row.status).label }}
            </span>
          </td>
          <td>{{ row.handleNote || '-' }}</td>
          <td class="row-actions">
            <button class="btn sm" type="button" :disabled="row.status !== 'PENDING'" @click="transit(row, 'PROCESSING', '已受理')">
              <Wrench />
              受理
            </button>
            <button class="btn sm" type="button" :disabled="row.status !== 'PROCESSING'" @click="transit(row, 'RESOLVED', '已处理')">
              <CircleCheck />
              解决
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="pager">
      <span class="total">共 {{ total }} 条 · 第 {{ page }} / {{ pageCount }} 页</span>
      <button class="pg nav-pg" type="button" :disabled="page <= 1 || loading" @click="changePage(page - 1)">
        ‹
      </button>
      <button class="pg on" type="button">{{ page }}</button>
      <button class="pg nav-pg" type="button" :disabled="page >= pageCount || loading" @click="changePage(page + 1)">
        ›
      </button>
    </div>
  </article>
</template>
