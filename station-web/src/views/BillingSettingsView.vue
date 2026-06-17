<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  CreditCard,
  Gauge,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  WalletCards,
} from 'lucide-vue-next';
import {
  billingPlansApi,
  billingStatusMeta,
  invoicesApi,
  payInvoiceApi,
  subscriptionsApi,
  usageApi,
  type BillingPlan,
  type Invoice,
  type Subscription,
  type UsageRecord,
} from '@/api/billing';

const loading = ref(false);
const payingId = ref('');
const tab = ref<'overview' | 'invoices' | 'usage'>('overview');
const plans = ref<BillingPlan[]>([]);
const subscriptions = ref<Subscription[]>([]);
const invoices = ref<Invoice[]>([]);
const usage = ref<UsageRecord[]>([]);

const activeSubscription = computed(
  () =>
    subscriptions.value.find((item) =>
      ['ACTIVE', 'PAST_DUE', 'SUSPENDED'].includes(item.status),
    ) ?? subscriptions.value[0],
);
const currentPlan = computed(() =>
  plans.value.find((plan) => plan.id === activeSubscription.value?.planId),
);
const openInvoices = computed(() =>
  invoices.value.filter((invoice) => ['OPEN', 'OVERDUE'].includes(invoice.status)),
);
const dueAmount = computed(() =>
  openInvoices.value.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
);
const paidAmount = computed(() =>
  invoices.value
    .filter((invoice) => invoice.status === 'PAID')
    .reduce((sum, invoice) => sum + invoice.totalAmount, 0),
);
const smsUsage = computed(
  () => usage.value.find((item) => item.metric === 'SMS')?.quantity ?? 0,
);
const smsQuota = computed(
  () => activeSubscription.value?.planSnapshot.quotas?.sms ?? currentPlan.value?.quotas.sms ?? 0,
);
const smsRate = computed(() => {
  if (smsQuota.value === -1) return 0;
  return Math.min(100, Math.round((smsUsage.value / Math.max(1, smsQuota.value)) * 100));
});

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const [planRes, subRes, invoiceRes, usageRes] = await Promise.all([
      billingPlansApi(),
      subscriptionsApi(),
      invoicesApi(),
      usageApi(),
    ]);
    plans.value = planRes;
    subscriptions.value = subRes;
    invoices.value = invoiceRes;
    usage.value = usageRes;
  } finally {
    loading.value = false;
  }
}

async function pay(invoice: Invoice) {
  payingId.value = invoice.id;
  try {
    await payInvoiceApi(invoice.id);
    ElMessage.success('账单已支付');
    await load();
  } finally {
    payingId.value = '';
  }
}

function money(value: number) {
  return `¥${(Number(value) / 100).toFixed(2)}`;
}

function dateText(value?: string | null) {
  return value ? value.slice(0, 10) : '-';
}

function quotaText(value: number) {
  return value === -1 ? '不限量' : String(value);
}
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">门店设置 / 订阅账单</div>
      <h1>订阅账单</h1>
    </div>
    <button class="btn" type="button" :disabled="loading" @click="load">
      <RotateCcw />
      刷新
    </button>
  </section>

  <section class="billing-hero card">
    <div class="billing-plan-main">
      <span class="tag blue"><span class="d"></span>当前套餐</span>
      <h2>{{ currentPlan?.name ?? '未开通套餐' }}</h2>
      <p>
        账期 {{ dateText(activeSubscription?.currentPeriodStart) }} 至
        {{ dateText(activeSubscription?.currentPeriodEnd) }}
      </p>
      <div class="billing-price tnum">
        {{ money(activeSubscription?.planSnapshot.monthlyPrice ?? currentPlan?.monthlyPrice ?? 0) }}
        <span>/ 月</span>
      </div>
    </div>
    <div class="billing-hero-side">
      <span
        class="tag"
        :class="billingStatusMeta(activeSubscription?.status ?? 'NONE').tag"
      >
        <span class="d"></span>{{ billingStatusMeta(activeSubscription?.status ?? 'NONE').label }}
      </span>
      <button class="btn btn-primary" type="button" :disabled="openInvoices.length === 0" @click="openInvoices[0] && pay(openInvoices[0])">
        <WalletCards />
        支付待付账单
      </button>
    </div>
  </section>

  <section class="billing-kpis">
    <article class="kpi">
      <div class="lab"><i><ReceiptText /></i>待付金额</div>
      <div class="num tnum">{{ money(dueAmount) }}</div>
      <div class="delta">OPEN / OVERDUE</div>
    </article>
    <article class="kpi">
      <div class="lab"><i><CreditCard /></i>已支付</div>
      <div class="num tnum">{{ money(paidAmount) }}</div>
      <div class="delta">订阅账单累计</div>
    </article>
    <article class="kpi">
      <div class="lab"><i><PackageCheck /></i>短信用量</div>
      <div class="num tnum">{{ smsUsage }}</div>
      <div class="delta">{{ smsQuota === -1 ? '不限量' : `额度 ${smsQuota}` }}</div>
    </article>
    <article class="kpi">
      <div class="lab"><i><Gauge /></i>用量进度</div>
      <div class="num tnum">{{ smsQuota === -1 ? '∞' : `${smsRate}%` }}</div>
      <div class="delta">本账期</div>
    </article>
  </section>

  <section class="table-card">
    <div class="tabs">
      <button class="tab" :class="{ on: tab === 'overview' }" type="button" @click="tab = 'overview'">套餐额度</button>
      <button class="tab" :class="{ on: tab === 'invoices' }" type="button" @click="tab = 'invoices'">账单</button>
      <button class="tab" :class="{ on: tab === 'usage' }" type="button" @click="tab = 'usage'">用量</button>
    </div>

    <div v-if="tab === 'overview'" class="billing-quota-grid">
      <article>
        <b>短信通知</b>
        <span class="tnum">{{ quotaText(smsQuota) }}</span>
        <div class="progress"><span :style="{ width: `${smsRate}%` }"></span></div>
      </article>
      <article>
        <b>包裹量</b>
        <span>{{ quotaText(activeSubscription?.planSnapshot.quotas?.parcels ?? -1) }}</span>
        <div class="progress"><span style="width: 0%"></span></div>
      </article>
      <article>
        <b>门店数</b>
        <span>{{ quotaText(activeSubscription?.planSnapshot.quotas?.stations ?? 1) }}</span>
        <div class="progress"><span style="width: 100%"></span></div>
      </article>
    </div>

    <table v-else-if="tab === 'invoices'">
      <thead>
        <tr>
          <th>账单号</th>
          <th>账期</th>
          <th>金额</th>
          <th>到期日</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="invoice in invoices" :key="invoice.id">
          <td class="code">{{ invoice.code }}</td>
          <td>{{ dateText(invoice.periodStart) }} 至 {{ dateText(invoice.periodEnd) }}</td>
          <td class="tnum">{{ money(invoice.totalAmount) }}</td>
          <td>{{ dateText(invoice.dueAt) }}</td>
          <td>
            <span class="tag" :class="billingStatusMeta(invoice.status).tag">
              <span class="d"></span>{{ billingStatusMeta(invoice.status).label }}
            </span>
          </td>
          <td>
            <button
              class="btn sm"
              type="button"
              :disabled="!['OPEN', 'OVERDUE'].includes(invoice.status) || payingId === invoice.id"
              @click="pay(invoice)"
            >
              <WalletCards />
              支付
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <table v-else>
      <thead>
        <tr>
          <th>指标</th>
          <th>数量</th>
          <th>账期</th>
          <th>订阅</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in usage" :key="row.id">
          <td>{{ row.metric }}</td>
          <td class="tnum">{{ row.quantity }}</td>
          <td>{{ dateText(row.periodStart) }}</td>
          <td>{{ row.subscriptionId.slice(0, 8) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
