<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
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

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const page = await listComplaintsApi({ page: 1, size: 50 });
    rows.value = page.list;
    total.value = page.total;
  } finally {
    loading.value = false;
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
    <table>
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
  </article>
</template>
