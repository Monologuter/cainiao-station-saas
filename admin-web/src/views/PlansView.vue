<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
  Archive,
  Check,
  Edit3,
  PackageCheck,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-vue-next";
import {
  archiveBillingPlanApi,
  billingPlansApi,
  createBillingPlanApi,
  updateBillingPlanApi,
  type BillingPlan,
  type PlanInput,
} from "@/api/billing";

const loading = ref(false);
const modalOpen = ref(false);
const editingId = ref<string | null>(null);
const plans = ref<BillingPlan[]>([]);
const form = reactive<PlanInput>({
  code: "",
  name: "",
  monthlyPrice: 9900,
  quotas: { sms: 300, parcels: -1, stations: 1 },
  overagePrices: { sms: 10, parcels: 0, stations: 19900 },
  description: "",
  sort: 0,
});

const sortedPlans = computed(() =>
  [...plans.value].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)),
);
const activePlans = computed(() =>
  sortedPlans.value.filter((plan) => plan.status === "ACTIVE"),
);

onMounted(load);

async function load() {
  loading.value = true;
  try {
    plans.value = await billingPlansApi();
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  Object.assign(form, {
    code: "",
    name: "",
    monthlyPrice: 9900,
    quotas: { sms: 300, parcels: -1, stations: 1 },
    overagePrices: { sms: 10, parcels: 0, stations: 19900 },
    description: "",
    sort: plans.value.length + 1,
  });
  modalOpen.value = true;
}

function openEdit(plan: BillingPlan) {
  editingId.value = plan.id;
  Object.assign(form, {
    code: plan.code,
    name: plan.name,
    monthlyPrice: plan.monthlyPrice,
    quotas: { ...plan.quotas },
    overagePrices: { ...plan.overagePrices },
    description: plan.description ?? "",
    sort: plan.sort ?? 0,
  });
  modalOpen.value = true;
}

async function submit() {
  const payload = {
    ...form,
    code: form.code.toUpperCase(),
    monthlyPrice: Number(form.monthlyPrice),
    quotas: normalizeNumbers(form.quotas),
    overagePrices: normalizeNumbers(form.overagePrices),
    sort: Number(form.sort ?? 0),
  };
  if (editingId.value) {
    await updateBillingPlanApi(editingId.value, payload);
  } else {
    await createBillingPlanApi(payload);
  }
  modalOpen.value = false;
  await load();
}

async function archivePlan(plan: BillingPlan) {
  await archiveBillingPlanApi(plan.id);
  await load();
}

function normalizeNumbers(record: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, Number(value)]),
  );
}

function money(value: number) {
  return `¥${(Number(value) / 100).toFixed(2)}`;
}

function quotaText(value?: number) {
  if (value === -1) return "不限量";
  return `${value ?? 0}`;
}

function planIcon(index: number) {
  return [PackageCheck, Zap, Sparkles][index % 3];
}
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">商业化 / 套餐配置</div>
      <h1>套餐配置</h1>
    </div>
    <div class="toolbar">
      <button class="btn" type="button" :disabled="loading" @click="load">
        <RotateCcw />
        刷新
      </button>
      <button class="btn btn-primary" type="button" @click="openCreate">
        <Plus />
        新建套餐
      </button>
    </div>
  </section>

  <section class="plan-grid">
    <article
      v-for="(plan, index) in activePlans"
      :key="plan.id"
      class="plan"
      :class="{ hot: index === 1, [`tier-${index + 1}`]: true }"
    >
      <div v-if="index === 1" class="ribbon">主推</div>
      <div class="plan-hd">
        <div class="plan-name">
          <span class="ic"><component :is="planIcon(index)" /></span>
          {{ plan.name }}
        </div>
        <p class="plan-desc">{{ plan.description || "面向稳定运营门店的订阅套餐" }}</p>
        <div class="plan-price">
          <span class="cur">¥</span>
          <span class="amt tnum">{{ (plan.monthlyPrice / 100).toFixed(0) }}</span>
          <span class="per">/ 月</span>
        </div>
        <div class="plan-sub">
          <span class="pill"><Check /> ACTIVE</span>
          <b>{{ plan.code }}</b>
        </div>
      </div>
      <div class="quota">
        <div class="qt">额度</div>
        <div class="qrow">
          <span class="ql">短信通知</span>
          <span class="qv">{{ quotaText(plan.quotas.sms) }}</span>
        </div>
        <div class="qrow">
          <span class="ql">包裹量</span>
          <span class="qv unlim">{{ quotaText(plan.quotas.parcels) }}</span>
        </div>
        <div class="qrow">
          <span class="ql">门店数</span>
          <span class="qv">{{ quotaText(plan.quotas.stations) }}</span>
        </div>
      </div>
      <div class="plan-ft">
        <button class="btn" type="button" @click="openEdit(plan)">
          <Edit3 />
          编辑套餐
        </button>
        <button class="btn btn-ghost" type="button" @click="archivePlan(plan)">
          <Archive />
          归档
        </button>
      </div>
    </article>
  </section>

  <section class="table-card fee-rule">
    <div class="card-hd">
      <h2>用量加费规则</h2>
      <span class="tag blue"><span class="d"></span>{{ activePlans.length }} 个在售</span>
    </div>
    <table>
      <thead>
        <tr>
          <th>套餐</th>
          <th>短信额度</th>
          <th>短信超额</th>
          <th>门店额度</th>
          <th>门店超额</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="plan in sortedPlans" :key="plan.id">
          <td>
            <div class="rk">
              <i><ShieldCheck /></i>
              <div>
                <b>{{ plan.name }}</b>
                <div class="muted">{{ plan.code }}</div>
              </div>
            </div>
          </td>
          <td>{{ quotaText(plan.quotas.sms) }}</td>
          <td class="price-cell"><b>{{ money(plan.overagePrices.sms ?? 0) }}</b> / 条</td>
          <td>{{ quotaText(plan.quotas.stations) }}</td>
          <td class="price-cell"><b>{{ money(plan.overagePrices.stations ?? 0) }}</b> / 店</td>
          <td>
            <span class="tag" :class="plan.status === 'ACTIVE' ? 'green' : 'gray'">
              <span class="d"></span>{{ plan.status }}
            </span>
          </td>
          <td>
            <span class="op" @click="openEdit(plan)">编辑</span>
            <span v-if="plan.status === 'ACTIVE'" class="op danger" @click="archivePlan(plan)">归档</span>
          </td>
        </tr>
      </tbody>
    </table>
  </section>

  <div v-if="modalOpen" class="mask">
    <section class="modal">
      <div class="hd">
        <h3>{{ editingId ? "编辑套餐" : "新建套餐" }}</h3>
        <button class="btn btn-ghost" type="button" @click="modalOpen = false">关闭</button>
      </div>
      <div class="bd form-grid">
        <div class="field">
          <label>套餐代码</label>
          <input v-model="form.code" class="input" placeholder="STANDARD" />
        </div>
        <div class="field">
          <label>套餐名称</label>
          <input v-model="form.name" class="input" placeholder="标准版" />
        </div>
        <div class="field">
          <label>月费（分）</label>
          <input v-model.number="form.monthlyPrice" class="input" type="number" />
        </div>
        <div class="field">
          <label>排序</label>
          <input v-model.number="form.sort" class="input" type="number" />
        </div>
        <div class="field">
          <label>短信额度</label>
          <input v-model.number="form.quotas.sms" class="input" type="number" />
        </div>
        <div class="field">
          <label>包裹额度</label>
          <input v-model.number="form.quotas.parcels" class="input" type="number" />
        </div>
        <div class="field">
          <label>门店额度</label>
          <input v-model.number="form.quotas.stations" class="input" type="number" />
        </div>
        <div class="field">
          <label>短信超额单价（分）</label>
          <input v-model.number="form.overagePrices.sms" class="input" type="number" />
        </div>
        <div class="field" style="grid-column: 1 / -1">
          <label>说明</label>
          <textarea v-model="form.description" class="input" rows="3"></textarea>
        </div>
      </div>
      <div class="ft">
        <button class="btn" type="button" @click="modalOpen = false">取消</button>
        <button class="btn btn-primary" type="button" @click="submit">
          <Save />
          保存
        </button>
      </div>
    </section>
  </div>
</template>
