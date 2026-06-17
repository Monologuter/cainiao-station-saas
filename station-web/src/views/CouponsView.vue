<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Gift, Plus, RotateCcw } from 'lucide-vue-next';
import {
  couponSceneMeta,
  createCouponTemplateApi,
  issueCouponsApi,
  listCouponTemplatesApi,
  type CouponTemplate,
  type CouponScene,
} from '@/api/coupon';

const rows = ref<CouponTemplate[]>([]);
const total = ref(0);
const loading = ref(false);
const form = reactive({
  name: '',
  type: 'DISCOUNT' as const,
  faceValue: 3,
  threshold: 0,
  scene: 'ALL' as CouponScene,
  costPoints: 10,
  totalStock: 100,
  validDays: 7,
});

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const page = await listCouponTemplatesApi({});
    rows.value = page.list;
    total.value = page.total;
  } finally {
    loading.value = false;
  }
}

async function createTemplate() {
  await createCouponTemplateApi({ ...form });
  ElMessage.success('券模板已创建');
  load();
}

async function issue(template: CouponTemplate) {
  await issueCouponsApi(template.id, []);
  ElMessage.success('已提交发券任务');
}
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">会员运营 / 优惠券</div>
      <h1>优惠券</h1>
    </div>
    <button class="btn" type="button" :disabled="loading" @click="load">
      <RotateCcw />
      刷新
    </button>
  </section>

  <section class="coupon-grid">
    <article class="table-card coupon-form-card">
      <div class="card-hd">
        <h2>创建模板</h2>
      </div>
      <form class="coupon-form" @submit.prevent="createTemplate">
        <input v-model="form.name" class="input" placeholder="券名称" />
        <select v-model="form.scene" class="input">
          <option value="ALL">全场景</option>
          <option value="PICKUP">取件</option>
          <option value="SHIP">寄件</option>
        </select>
        <input v-model.number="form.faceValue" class="input" type="number" placeholder="面额" />
        <input v-model.number="form.costPoints" class="input" type="number" placeholder="兑换积分" />
        <input v-model.number="form.validDays" class="input" type="number" placeholder="有效天数" />
        <button class="btn btn-primary" type="submit">
          <Plus />
          创建
        </button>
      </form>
    </article>

    <article class="table-card">
      <div class="card-hd">
        <h2>券模板</h2>
        <span class="muted">共 {{ total }} 条</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>名称</th>
            <th>场景</th>
            <th>面额</th>
            <th>积分</th>
            <th>库存</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>{{ row.name }}</td>
            <td>
              <span class="tag" :class="couponSceneMeta(row.scene).tag">
                <span class="d"></span>
                {{ couponSceneMeta(row.scene).label }}
              </span>
            </td>
            <td>{{ row.faceValue }}</td>
            <td>{{ row.costPoints ?? '-' }}</td>
            <td>{{ row.issuedCount }} / {{ row.totalStock ?? '不限' }}</td>
            <td>
              <button class="btn sm" type="button" @click="issue(row)">
                <Gift />
                发券
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </article>
  </section>
</template>
