<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index';
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { ElEmpty } from 'element-plus/es/components/empty/index';
import { MessageSquareReply, RotateCcw, Star } from 'lucide-vue-next';
import {
  listReviewsApi,
  replyReviewApi,
  reviewStatusMeta,
  satisfactionSummaryApi,
  type ReviewItem,
  type ReviewStatus,
  type SatisfactionSummary,
} from '@/api/review';

const loading = ref(false);
const rows = ref<ReviewItem[]>([]);
const total = ref(0);
const summary = ref<SatisfactionSummary | null>(null);
const filters = reactive({
  status: '' as ReviewStatus | '',
  rating: undefined as number | undefined,
  page: 1,
  size: 20,
});
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / filters.size)));

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const [page, stats] = await Promise.all([
      listReviewsApi(filters),
      satisfactionSummaryApi({
        from: '2026-01-01',
        to: '2026-12-31',
      }),
    ]);
    rows.value = page.list;
    total.value = page.total;
    normalizePage();
    summary.value = stats;
  } finally {
    loading.value = false;
  }
}

async function changePage(next: number) {
  filters.page = Math.min(Math.max(1, next), pageCount.value);
  await load();
}

function normalizePage() {
  if (filters.page > pageCount.value) {
    filters.page = pageCount.value;
  }
}

async function reply(row: ReviewItem) {
  const { value } = await ElMessageBox.prompt('回复内容', '回复评价', {
    inputPlaceholder: '感谢认可，我们会继续保持',
  });
  await replyReviewApi(row.id, value);
  ElMessage.success('已回复评价');
  load();
}
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">会员运营 / 评价</div>
      <h1>评价管理</h1>
    </div>
    <button class="btn" type="button" :disabled="loading" @click="load">
      <RotateCcw />
      刷新
    </button>
  </section>

  <section class="review-kpis">
    <article class="table-card review-kpi">
      <Star />
      <div>
        <b>{{ summary?.avgRating ?? 0 }}</b>
        <p>平均评分</p>
      </div>
    </article>
    <article class="table-card review-kpi">
      <MessageSquareReply />
      <div>
        <b>{{ summary?.reviewCount ?? 0 }}</b>
        <p>评价数</p>
      </div>
    </article>
    <article class="table-card review-kpi">
      <div class="rate-dot"></div>
      <div>
        <b>{{ ((summary?.complaintRate ?? 0) * 100).toFixed(1) }}%</b>
        <p>投诉率</p>
      </div>
    </article>
  </section>

  <article class="table-card">
    <div class="card-hd">
      <h2>评价列表</h2>
      <span class="muted">共 {{ total }} 条</span>
    </div>
    <el-empty v-if="!loading && rows.length === 0" description="暂无评价" />
    <table v-else>
      <thead>
        <tr>
          <th>评分</th>
          <th>手机号</th>
          <th>业务单</th>
          <th>内容</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td>{{ row.rating }} 星</td>
          <td>{{ row.consumerPhone }}</td>
          <td>{{ row.refType }} / {{ row.refId }}</td>
          <td>{{ row.content || '-' }}</td>
          <td>
            <span class="tag" :class="reviewStatusMeta(row.status).tag">
              <span class="d"></span>
              {{ reviewStatusMeta(row.status).label }}
            </span>
          </td>
          <td>
            <button class="btn sm" type="button" :disabled="row.status !== 'PUBLISHED'" @click="reply(row)">
              <MessageSquareReply />
              回复
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="pager">
      <span class="total">共 {{ total }} 条 · 第 {{ filters.page }} / {{ pageCount }} 页</span>
      <button class="pg nav-pg" type="button" :disabled="filters.page <= 1 || loading" @click="changePage(filters.page - 1)">
        ‹
      </button>
      <button class="pg on" type="button">{{ filters.page }}</button>
      <button class="pg nav-pg" type="button" :disabled="filters.page >= pageCount || loading" @click="changePage(filters.page + 1)">
        ›
      </button>
    </div>
  </article>
</template>
