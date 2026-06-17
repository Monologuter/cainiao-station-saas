<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import {
  BadgeCheck,
  Building2,
  FileCheck2,
  FileText,
  LoaderCircle,
  Search,
  Send,
  Store,
  UploadCloud,
  UserRound,
} from "lucide-vue-next";
import {
  submitOnboardingApplicationApi,
  trackOnboardingApplicationApi,
  uploadQualificationUrlApi,
  type QualificationFile,
} from "@/api/onboarding";

const submitting = ref(false);
const tracking = ref(false);
const submitted = ref<{ applicationNo: string; status: string } | null>(null);
const tracked = ref<{
  applicationNo: string;
  status: string;
  rejectReason?: string | null;
} | null>(null);

const form = reactive({
  entityType: "COMPANY" as "COMPANY" | "INDIVIDUAL",
  entityName: "",
  unifiedCreditCode: "",
  regionCode: "310000",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  stationName: "",
  stationAddress: "",
  proposedPlanCode: "BASIC",
  qualifications: [] as QualificationFile[],
});

const trackForm = reactive({
  applicationNo: "",
  contactPhone: "",
});

const requiredFiles = computed(() =>
  form.entityType === "COMPANY"
    ? [{ type: "BUSINESS_LICENSE", label: "营业执照" }]
    : [
        { type: "ID_CARD_FRONT", label: "身份证人像面" },
        { type: "ID_CARD_BACK", label: "身份证国徽面" },
      ],
);

function hasFile(type: string) {
  return form.qualifications.some((file) => file.type === type);
}

async function mockUpload(type: string, label: string) {
  const upload = await uploadQualificationUrlApi({
    fileType: type,
    contentType: "image/jpeg",
  });
  form.qualifications = [
    ...form.qualifications.filter((file) => file.type !== type),
    {
      type,
      fileKey: upload.fileKey,
      fileName: `${label}.jpg`,
    },
  ];
}

function validateForm() {
  if (
    !form.entityName ||
    !form.contactName ||
    !form.contactPhone ||
    !form.stationName ||
    !form.stationAddress
  ) {
    ElMessage.error("请补全主体、联系人和门店信息");
    return false;
  }
  if (form.entityType === "COMPANY" && !form.unifiedCreditCode) {
    ElMessage.error("企业入驻需填写统一社会信用代码");
    return false;
  }
  if (!/^1\d{10}$/.test(form.contactPhone)) {
    ElMessage.error("请输入 11 位手机号");
    return false;
  }
  if (!requiredFiles.value.every((file) => hasFile(file.type))) {
    ElMessage.error("请上传必需资质材料");
    return false;
  }
  return true;
}

async function submit() {
  if (!validateForm()) return;
  submitting.value = true;
  try {
    const result = await submitOnboardingApplicationApi({
      ...form,
      unifiedCreditCode: form.unifiedCreditCode || undefined,
      contactEmail: form.contactEmail || undefined,
      proposedPlanCode: form.proposedPlanCode || undefined,
    });
    submitted.value = result;
    trackForm.applicationNo = result.applicationNo;
    trackForm.contactPhone = form.contactPhone;
    ElMessage.success("申请已提交");
  } finally {
    submitting.value = false;
  }
}

async function track() {
  if (!trackForm.applicationNo || !trackForm.contactPhone) {
    ElMessage.error("请输入申请单号和手机号");
    return;
  }
  tracking.value = true;
  try {
    tracked.value = await trackOnboardingApplicationApi(trackForm);
  } finally {
    tracking.value = false;
  }
}

function statusMeta(status?: string) {
  const map: Record<string, { label: string; tag: string }> = {
    PENDING: { label: "待审核", tag: "amber" },
    APPROVED: { label: "已通过", tag: "green" },
    REJECTED: { label: "已驳回", tag: "red" },
  };
  return map[status ?? ""] ?? { label: status ?? "-", tag: "gray" };
}
</script>

<template>
  <main class="onboarding-page">
    <section class="onboarding-hero">
      <div class="brand-line">
        <span class="logo"><Store /></span>
        <div>
          <b>菜鸟驿站 SaaS</b>
          <span>自助入驻审核通道</span>
        </div>
      </div>
      <h1>提交门店资料，审核通过后自动开通驿站工作台</h1>
      <p>主体资质、联系人和拟开门店一次提交；平台审核通过后将创建租户、店长账号并开通订阅。</p>
      <div class="onboarding-steps">
        <span><FileText /> 填写资料</span>
        <span><UploadCloud /> 上传资质</span>
        <span><BadgeCheck /> 审核开通</span>
      </div>
    </section>

    <section class="onboarding-grid">
      <form class="card onboarding-form" @submit.prevent="submit">
        <div class="card-hd">
          <h2>入驻申请</h2>
          <span class="tag amber"><span class="d"></span>公开提交</span>
        </div>
        <div class="bd form-block">
          <div class="subhd"><Building2 /> 主体信息</div>
          <div class="form-grid">
            <label class="field">
              <span>主体类型</span>
              <select v-model="form.entityType" class="select">
                <option value="COMPANY">企业</option>
                <option value="INDIVIDUAL">个体</option>
              </select>
            </label>
            <label class="field">
              <span>主体名称 <i class="req">*</i></span>
              <input v-model.trim="form.entityName" class="input" />
            </label>
            <label v-if="form.entityType === 'COMPANY'" class="field">
              <span>统一社会信用代码 <i class="req">*</i></span>
              <input v-model.trim="form.unifiedCreditCode" class="input" />
            </label>
            <label class="field">
              <span>行政区划码</span>
              <input v-model.trim="form.regionCode" class="input" />
            </label>
          </div>

          <div class="subhd"><UserRound /> 联系人</div>
          <div class="form-grid">
            <label class="field">
              <span>姓名 <i class="req">*</i></span>
              <input v-model.trim="form.contactName" class="input" />
            </label>
            <label class="field">
              <span>手机号 <i class="req">*</i></span>
              <input v-model.trim="form.contactPhone" class="input" />
            </label>
            <label class="field span-2">
              <span>邮箱</span>
              <input v-model.trim="form.contactEmail" class="input" />
            </label>
          </div>

          <div class="subhd"><Store /> 拟开门店</div>
          <div class="form-grid">
            <label class="field">
              <span>门店名称 <i class="req">*</i></span>
              <input v-model.trim="form.stationName" class="input" />
            </label>
            <label class="field">
              <span>意向套餐</span>
              <select v-model="form.proposedPlanCode" class="select">
                <option value="BASIC">基础版</option>
                <option value="STANDARD">标准版</option>
                <option value="FLAGSHIP">旗舰版</option>
              </select>
            </label>
            <label class="field span-2">
              <span>门店地址 <i class="req">*</i></span>
              <input v-model.trim="form.stationAddress" class="input" />
            </label>
          </div>

          <div class="subhd"><FileCheck2 /> 资质材料</div>
          <div class="upload-list">
            <button
              v-for="file in requiredFiles"
              :key="file.type"
              class="upload-tile"
              type="button"
              @click="mockUpload(file.type, file.label)"
            >
              <UploadCloud />
              <b>{{ file.label }}</b>
              <span>{{ hasFile(file.type) ? "已上传" : "点击模拟上传" }}</span>
            </button>
          </div>
        </div>
        <div class="onboarding-actions">
          <button class="btn btn-primary btn-lg" type="submit" :disabled="submitting">
            <LoaderCircle v-if="submitting" class="spin" />
            <Send v-else />
            {{ submitting ? "提交中" : "提交申请" }}
          </button>
        </div>
      </form>

      <aside class="card track-card">
        <div class="card-hd">
          <h2>进度查询</h2>
        </div>
        <div class="bd track-body">
          <label class="field">
            <span>申请单号</span>
            <input v-model.trim="trackForm.applicationNo" class="input" />
          </label>
          <label class="field">
            <span>联系人手机号</span>
            <input v-model.trim="trackForm.contactPhone" class="input" />
          </label>
          <button class="btn btn-primary" type="button" :disabled="tracking" @click="track">
            <Search />
            {{ tracking ? "查询中" : "查询进度" }}
          </button>

          <div v-if="submitted || tracked" class="track-result">
            <span class="tag" :class="statusMeta((tracked || submitted)?.status).tag">
              <span class="d"></span>{{ statusMeta((tracked || submitted)?.status).label }}
            </span>
            <b>{{ (tracked || submitted)?.applicationNo }}</b>
            <p v-if="tracked?.rejectReason">{{ tracked.rejectReason }}</p>
            <p v-else>平台运营会尽快审核，审核结果将通过短信通知联系人。</p>
          </div>
        </div>
      </aside>
    </section>
  </main>
</template>
