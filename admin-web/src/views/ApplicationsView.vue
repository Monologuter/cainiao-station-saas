<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import {
  CheckCircle2,
  Eye,
  FileText,
  RotateCcw,
  Search,
  X,
  XCircle,
} from "lucide-vue-next";
import { billingPlansApi, type BillingPlan } from "@/api/billing";
import {
  approveApplicationApi,
  applicationDetailApi,
  applicationsApi,
  rejectApplicationApi,
  type TenantApplication,
} from "@/api/applications";

const loading = ref(false);
const reviewLoading = ref(false);
const tab = ref<"PENDING" | "APPROVED" | "REJECTED" | "ALL">("PENDING");
const keyword = ref("");
const applications = ref<TenantApplication[]>([]);
const total = ref(0);
const plans = ref<BillingPlan[]>([]);
const selected = ref<TenantApplication | null>(null);
const review = reactive({
  planCode: "BASIC",
  stationName: "",
  rejectReason: "",
});

const pendingCount = computed(
  () => applications.value.filter((item) => item.status === "PENDING").length,
);

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const [list, planRows] = await Promise.all([
      applicationsApi({
        status: tab.value === "ALL" ? "" : tab.value,
        keyword: keyword.value,
        page: 1,
        pageSize: 50,
      }),
      billingPlansApi(),
    ]);
    applications.value = list.items;
    total.value = list.total;
    plans.value = planRows.filter((plan) => plan.status === "ACTIVE");
  } catch (error) {
    ElMessage.error(errorText(error, "加载入驻申请失败"));
  } finally {
    loading.value = false;
  }
}

function errorText(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

async function openReview(row: TenantApplication) {
  selected.value = await applicationDetailApi(row.id);
  review.planCode = selected.value.proposedPlanCode || plans.value[0]?.code || "BASIC";
  review.stationName = selected.value.stationName;
  review.rejectReason = "";
}

function closeReview() {
  selected.value = null;
}

async function approve() {
  if (!selected.value) return;
  reviewLoading.value = true;
  try {
    const result = await approveApplicationApi(selected.value.id, {
      planCode: review.planCode,
      stationName: review.stationName,
    });
    ElMessage.success(`已开通租户，店长账号 ${result.ownerUsername}`);
    closeReview();
    await load();
  } catch (error) {
    ElMessage.error(errorText(error, "开通租户失败"));
  } finally {
    reviewLoading.value = false;
  }
}

async function reject() {
  if (!selected.value) return;
  if (!review.rejectReason.trim()) {
    ElMessage.error("请填写驳回原因");
    return;
  }
  reviewLoading.value = true;
  try {
    await rejectApplicationApi(selected.value.id, review.rejectReason.trim());
    ElMessage.success("已驳回申请");
    closeReview();
    await load();
  } catch (error) {
    ElMessage.error(errorText(error, "驳回申请失败"));
  } finally {
    reviewLoading.value = false;
  }
}

function statusClass(status: string) {
  const map: Record<string, string> = {
    PENDING: "amber",
    APPROVED: "green",
    REJECTED: "red",
  };
  return map[status] ?? "gray";
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    PENDING: "待审核",
    APPROVED: "已通过",
    REJECTED: "已驳回",
  };
  return map[status] ?? status;
}

function entityLabel(type: string) {
  return type === "COMPANY" ? "企业" : "个体";
}

function maskPhone(phone: string) {
  return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
}

function dateText(value: string) {
  return value?.slice(0, 16).replace("T", " ") ?? "-";
}
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">运营 / 入驻审核</div>
      <h1>入驻审核</h1>
    </div>
    <div class="toolbar">
      <button class="btn" type="button" :disabled="loading" @click="load">
        <RotateCcw />
        刷新
      </button>
    </div>
  </section>

  <section class="table-card applications-panel">
    <div class="tabs">
      <button class="tab" :class="{ on: tab === 'PENDING' }" @click="tab = 'PENDING'; load()">
        待审核 <span class="tnum">({{ pendingCount }})</span>
      </button>
      <button class="tab" :class="{ on: tab === 'APPROVED' }" @click="tab = 'APPROVED'; load()">已通过</button>
      <button class="tab" :class="{ on: tab === 'REJECTED' }" @click="tab = 'REJECTED'; load()">已驳回</button>
      <button class="tab" :class="{ on: tab === 'ALL' }" @click="tab = 'ALL'; load()">全部</button>
    </div>

    <div class="applications-toolbar">
      <label class="search-input">
        <Search />
        <input v-model.trim="keyword" placeholder="申请编号 / 主体 / 手机号" @keyup.enter="load" />
      </label>
      <span class="muted">共 <b class="tnum">{{ total }}</b> 条申请</span>
      <button class="btn btn-primary" type="button" @click="load">筛选</button>
    </div>

    <table>
      <thead>
        <tr>
          <th>申请编号</th>
          <th>申请主体</th>
          <th>联系人</th>
          <th>拟开门店</th>
          <th>提交时间</th>
          <th>状态</th>
          <th style="text-align: right">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in applications" :key="item.id">
          <td><span class="code">{{ item.applicationNo }}</span></td>
          <td>
            <b>{{ item.entityName }}</b>
            <span class="tag blue entity-tag">{{ entityLabel(item.entityType) }}</span>
          </td>
          <td>{{ item.contactName }} · {{ maskPhone(item.contactPhone) }}</td>
          <td>{{ item.stationName }}</td>
          <td class="tnum">{{ dateText(item.createdAt) }}</td>
          <td>
            <span class="tag" :class="statusClass(item.status)">
              <span class="d"></span>{{ statusLabel(item.status) }}
            </span>
          </td>
          <td style="text-align: right">
            <button type="button" class="op" @click="openReview(item)">
              {{ item.status === "PENDING" ? "审核" : "详情" }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <el-empty v-if="!loading && applications.length === 0" description="暂无入驻申请" />
  </section>

  <div v-if="selected" class="mask" @click.self="closeReview">
    <section class="modal application-modal">
      <div class="hd">
        <h3>{{ selected.applicationNo }} · {{ selected.entityName }}</h3>
        <button class="btn btn-ghost" type="button" @click="closeReview"><X /></button>
      </div>
      <div class="bd review-layout">
        <div class="review-block">
          <h4><FileText /> 申请资料</h4>
          <dl class="review-dl">
            <dt>主体类型</dt><dd>{{ entityLabel(selected.entityType) }}</dd>
            <dt>联系人</dt><dd>{{ selected.contactName }} · {{ selected.contactPhone }}</dd>
            <dt>门店名称</dt><dd>{{ selected.stationName }}</dd>
            <dt>门店地址</dt><dd>{{ selected.stationAddress }}</dd>
          </dl>
          <div class="license-list">
            <a
              v-for="file in selected.qualifications"
              :key="file.fileKey"
              :href="file.downloadUrl"
              target="_blank"
              rel="noreferrer"
            >
              <Eye /> {{ file.fileName }}
            </a>
          </div>
        </div>

        <div class="review-block">
          <h4><CheckCircle2 /> 审核处理</h4>
          <label class="field">
            <label>分配套餐</label>
            <select v-model="review.planCode" class="input">
              <option v-for="plan in plans" :key="plan.id" :value="plan.code">
                {{ plan.name }} · {{ plan.code }}
              </option>
            </select>
          </label>
          <label class="field">
            <label>开通门店名</label>
            <input v-model.trim="review.stationName" class="input" />
          </label>
          <label class="field">
            <label>驳回原因</label>
            <textarea v-model.trim="review.rejectReason" class="input" rows="4" />
          </label>
        </div>
      </div>
      <div class="ft">
        <button class="btn btn-danger" type="button" :disabled="reviewLoading" @click="reject">
          <XCircle /> 驳回
        </button>
        <button class="btn btn-primary" type="button" :disabled="reviewLoading" @click="approve">
          <CheckCircle2 /> 通过并开通
        </button>
      </div>
    </section>
  </div>
</template>
