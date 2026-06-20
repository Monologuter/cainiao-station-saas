<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import {
  AlertTriangle,
  Banknote,
  Clock3,
  CreditCard,
  PlayCircle,
  RotateCcw,
  WalletCards,
} from "lucide-vue-next";
import {
  billingInvoicesApi,
  billingSubscriptionsApi,
  billingUsageApi,
  runBillingInvoiceApi,
  type Invoice,
  type Subscription,
  type UsageRecord,
} from "@/api/billing";
import { billingStatusMeta } from "@/utils/status-labels";

const loading = ref(false);
const tab = ref<"subscriptions" | "invoices" | "usage">("subscriptions");
const subscriptions = ref<Subscription[]>([]);
const invoices = ref<Invoice[]>([]);
const usage = ref<UsageRecord[]>([]);
const page = ref(1);
const pageSize = 20;

const openInvoices = computed(() =>
  invoices.value.filter((invoice) => invoice.status === "OPEN"),
);
const overdueInvoices = computed(() =>
  invoices.value.filter((invoice) => invoice.status === "OVERDUE"),
);
const paidAmount = computed(() =>
  invoices.value
    .filter((invoice) => invoice.status === "PAID")
    .reduce((sum, invoice) => sum + invoice.totalAmount, 0),
);
const dueAmount = computed(() =>
  [...openInvoices.value, ...overdueInvoices.value].reduce(
    (sum, invoice) => sum + invoice.totalAmount,
    0,
  ),
);
const totalUsage = computed(() =>
  usage.value.reduce((sum, row) => sum + Number(row.quantity), 0),
);
const currentTotal = computed(() => {
  if (tab.value === "subscriptions") return subscriptions.value.length;
  if (tab.value === "invoices") return invoices.value.length;
  return usage.value.length;
});
const totalPages = computed(() => Math.max(1, Math.ceil(currentTotal.value / pageSize)));
const pagedSubscriptions = computed(() => paginate(subscriptions.value));
const pagedInvoices = computed(() => paginate(invoices.value));
const pagedUsage = computed(() => paginate(usage.value));

onMounted(load);
watch(tab, () => {
  page.value = 1;
});

async function load() {
  loading.value = true;
  try {
    const [subRes, invoiceRes, usageRes] = await Promise.all([
      billingSubscriptionsApi(),
      billingInvoicesApi(),
      billingUsageApi(),
    ]);
    subscriptions.value = subRes;
    invoices.value = invoiceRes;
    usage.value = usageRes;
    normalizePage();
  } catch (error) {
    ElMessage.error(errorText(error, "加载订阅与账单失败"));
  } finally {
    loading.value = false;
  }
}

async function runInvoice(subscription: Subscription) {
  try {
    await runBillingInvoiceApi({
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
    });
    ElMessage.success("已发起出账");
    await load();
  } catch (error) {
    ElMessage.error(errorText(error, "手动出账失败"));
  }
}

function errorText(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

function money(value: number) {
  return `¥${(Number(value) / 100).toFixed(2)}`;
}

function dateText(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 10);
}

function paginate<T>(rows: T[]) {
  const start = (page.value - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

function changePage(next: number) {
  page.value = Math.min(Math.max(1, next), totalPages.value);
}

function normalizePage() {
  if (page.value > totalPages.value) {
    page.value = totalPages.value;
  }
}

function statusClass(status: string) {
  const map: Record<string, string> = {
    ACTIVE: "green",
    PAID: "green",
    OPEN: "blue",
    OVERDUE: "red",
    PAST_DUE: "amber",
    SUSPENDED: "red",
    VOID: "gray",
  };
  return map[status] ?? "gray";
}
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">商业化 / 订阅与账单</div>
      <h1>订阅与账单</h1>
    </div>
    <div class="toolbar">
      <button class="btn" type="button" :disabled="loading" @click="load">
        <RotateCcw />
        刷新
      </button>
      <button
        class="btn btn-primary"
        type="button"
        :disabled="subscriptions.length === 0"
        @click="subscriptions[0] && runInvoice(subscriptions[0])"
      >
        <PlayCircle />
        手动出账
      </button>
    </div>
  </section>

  <section class="kpi-grid">
    <article class="kpi">
      <div class="lab">
        <i><CreditCard /></i>
        活跃订阅
      </div>
      <div class="num tnum">{{ subscriptions.length }}</div>
      <div class="delta">当前租户订阅</div>
    </article>
    <article class="kpi">
      <div class="lab">
        <i class="green"><WalletCards /></i>
        已回款
      </div>
      <div class="num tnum">{{ money(paidAmount) }}</div>
      <div class="delta">订阅账单</div>
    </article>
    <article class="kpi">
      <div class="lab">
        <i class="amber"><Clock3 /></i>
        待收款
      </div>
      <div class="num tnum">{{ money(dueAmount) }}</div>
      <div class="delta warn">待支付 / 已逾期</div>
    </article>
    <article class="kpi">
      <div class="lab">
        <i class="purple"><Banknote /></i>
        计量用量
      </div>
      <div class="num tnum">{{ totalUsage }}</div>
      <div class="delta mut">本期 usage records</div>
    </article>
  </section>

  <section class="table-card billing-panel">
    <div class="tabs">
      <button
        class="tab"
        :class="{ on: tab === 'subscriptions' }"
        type="button"
        @click="tab = 'subscriptions'"
      >
        订阅
      </button>
      <button
        class="tab"
        :class="{ on: tab === 'invoices' }"
        type="button"
        @click="tab = 'invoices'"
      >
        账单
      </button>
      <button
        class="tab"
        :class="{ on: tab === 'usage' }"
        type="button"
        @click="tab = 'usage'"
      >
        用量
      </button>
    </div>

    <table v-if="tab === 'subscriptions'">
      <thead>
        <tr>
          <th>订阅</th>
          <th>租户</th>
          <th>套餐快照</th>
          <th>账期</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in pagedSubscriptions" :key="item.id">
          <td class="code">{{ item.id.slice(0, 8) }}</td>
          <td>{{ item.tenantId.slice(0, 8) }}</td>
          <td>{{ money(item.planSnapshot.monthlyPrice) }}</td>
          <td>
            <span class="cycle">{{ dateText(item.currentPeriodStart) }} 至 {{ dateText(item.currentPeriodEnd) }}</span>
          </td>
          <td>
            <span class="tag" :class="statusClass(item.status)">
              <span class="d"></span>{{ billingStatusMeta(item.status).label }}
            </span>
          </td>
          <td>
            <button type="button" class="op" @click="runInvoice(item)">手动出账</button>
          </td>
        </tr>
      </tbody>
    </table>

    <table v-else-if="tab === 'invoices'">
      <thead>
        <tr>
          <th>账单号</th>
          <th>租户</th>
          <th>账期</th>
          <th>金额</th>
          <th>到期日</th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="invoice in pagedInvoices" :key="invoice.id">
          <td class="code">{{ invoice.code }}</td>
          <td>{{ invoice.tenantId.slice(0, 8) }}</td>
          <td>{{ dateText(invoice.periodStart) }} 至 {{ dateText(invoice.periodEnd) }}</td>
          <td class="amt">
            {{ money(invoice.totalAmount) }}
            <small>基础 {{ money(invoice.baseAmount) }}</small>
          </td>
          <td>{{ dateText(invoice.dueAt) }}</td>
          <td>
            <span class="tag" :class="statusClass(invoice.status)">
              <span class="d"></span>{{ billingStatusMeta(invoice.status).label }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <table v-else>
      <thead>
        <tr>
          <th>记录</th>
          <th>租户</th>
          <th>订阅</th>
          <th>指标</th>
          <th>数量</th>
          <th>账期</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in pagedUsage" :key="row.id">
          <td class="code">{{ row.id.slice(0, 8) }}</td>
          <td>{{ row.tenantId.slice(0, 8) }}</td>
          <td>{{ row.subscriptionId.slice(0, 8) }}</td>
          <td>
            <span class="tag method"><span class="d"></span>{{ row.metric }}</span>
          </td>
          <td class="tnum">{{ row.quantity }}</td>
          <td>{{ dateText(row.periodStart) }}</td>
        </tr>
      </tbody>
    </table>

    <el-empty
      v-if="
        !loading &&
        ((tab === 'subscriptions' && subscriptions.length === 0) ||
          (tab === 'invoices' && invoices.length === 0) ||
          (tab === 'usage' && usage.length === 0))
      "
      description="暂无数据"
    />
    <div class="pager" aria-label="账单分页">
      <span>共 {{ currentTotal }} 条，第 {{ page }} / {{ totalPages }} 页</span>
      <button class="btn" type="button" :disabled="page <= 1 || loading" @click="changePage(page - 1)">
        上一页
      </button>
      <button class="btn" type="button" :disabled="page >= totalPages || loading" @click="changePage(page + 1)">
        下一页
      </button>
    </div>
  </section>

  <section v-if="overdueInvoices.length > 0" class="note overdue-note">
    <AlertTriangle />
    当前有 {{ overdueInvoices.length }} 张逾期账单，请跟进租户回款与停用恢复。
  </section>
</template>
