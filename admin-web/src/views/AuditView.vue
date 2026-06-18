<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { RotateCcw, Search, ShieldCheck, X } from "lucide-vue-next";
import {
  auditActionsApi,
  auditLogDetailApi,
  auditLogsApi,
  type AuditLog,
} from "@/api/audit";

const loading = ref(false);
const actions = ref<string[]>([]);
const logs = ref<AuditLog[]>([]);
const total = ref(0);
const selected = ref<AuditLog | null>(null);
const filters = reactive({
  tenantId: "",
  actorId: "",
  action: "",
  resourceType: "",
  result: "",
});

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const [list, actionRows] = await Promise.all([
      auditLogsApi({ ...filters, page: 1, pageSize: 50 }),
      auditActionsApi(),
    ]);
    logs.value = list.items;
    total.value = list.total;
    actions.value = actionRows;
  } catch (error) {
    ElMessage.error(errorText(error, "加载审计日志失败"));
  } finally {
    loading.value = false;
  }
}

async function openDetail(row: AuditLog) {
  try {
    selected.value = await auditLogDetailApi(row.id);
  } catch (error) {
    ElMessage.error(errorText(error, "加载审计详情失败"));
  }
}

function errorText(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

function closeDetail() {
  selected.value = null;
}

function resultClass(result: string) {
  return result === "SUCCESS" ? "green" : "red";
}

function resultLabel(result: string) {
  return result === "SUCCESS" ? "成功" : "失败";
}

function actorLabel(type: string) {
  const map: Record<string, string> = {
    PLATFORM: "平台",
    STAFF: "门店",
    SYSTEM: "系统",
  };
  return map[type] ?? type;
}

function dateText(value: string) {
  return value?.slice(0, 19).replace("T", " ") ?? "-";
}

function diffRows(log: AuditLog | null) {
  return Object.entries(log?.diff ?? {}).map(([field, item]) => ({
    field,
    type: item.type,
    before: stringifyValue(item.before),
    after: stringifyValue(item.after),
  }));
}

function stringifyValue(value: unknown) {
  if (value === undefined || value === null) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">系统 / 操作审计</div>
      <h1>操作审计</h1>
    </div>
    <div class="toolbar">
      <button class="btn" type="button" :disabled="loading" @click="load">
        <RotateCcw />
        刷新
      </button>
    </div>
  </section>

  <section class="table-card audit-panel">
    <div class="applications-toolbar audit-toolbar">
      <label class="search-input">
        <Search />
        <input v-model.trim="filters.tenantId" placeholder="租户 ID" @keyup.enter="load" />
      </label>
      <input v-model.trim="filters.actorId" class="input audit-filter" placeholder="操作人 ID" @keyup.enter="load" />
      <select v-model="filters.action" class="input audit-filter">
        <option value="">全部动作</option>
        <option v-for="action in actions" :key="action" :value="action">{{ action }}</option>
      </select>
      <input v-model.trim="filters.resourceType" class="input audit-filter" placeholder="资源类型" @keyup.enter="load" />
      <select v-model="filters.result" class="input audit-filter">
        <option value="">全部结果</option>
        <option value="SUCCESS">成功</option>
        <option value="FAILURE">失败</option>
      </select>
      <span class="muted">共 <b class="tnum">{{ total }}</b> 条</span>
      <button class="btn btn-primary" type="button" @click="load">筛选</button>
    </div>

    <table>
      <thead>
        <tr>
          <th>时间</th>
          <th>操作人</th>
          <th>动作</th>
          <th>资源</th>
          <th>结果</th>
          <th>摘要</th>
          <th style="text-align: right">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in logs" :key="item.id">
          <td class="tnum">{{ dateText(item.createdAt) }}</td>
          <td>
            <b>{{ item.actorName || item.actorId || "-" }}</b>
            <span class="tag blue entity-tag">{{ actorLabel(item.actorType) }}</span>
          </td>
          <td><span class="code">{{ item.action }}</span></td>
          <td>
            <b>{{ item.resourceType }}</b>
            <span class="muted audit-resource">{{ item.resourceId || "-" }}</span>
          </td>
          <td>
            <span class="tag" :class="resultClass(item.result)">
              <span class="d"></span>{{ resultLabel(item.result) }}
            </span>
          </td>
          <td>{{ item.summary || "-" }}</td>
          <td style="text-align: right">
            <button type="button" class="op" @click="openDetail(item)">详情</button>
          </td>
        </tr>
      </tbody>
    </table>
    <el-empty v-if="!loading && logs.length === 0" description="暂无审计记录" />
  </section>

  <div v-if="selected" class="mask" @click.self="closeDetail">
    <section class="modal audit-modal">
      <div class="hd">
        <h3>{{ selected.action }}</h3>
        <button class="btn btn-ghost" type="button" @click="closeDetail"><X /></button>
      </div>
      <div class="bd audit-detail">
        <div class="audit-summary">
          <span class="tag" :class="resultClass(selected.result)">
            <span class="d"></span>{{ resultLabel(selected.result) }}
          </span>
          <b>{{ selected.summary || "无摘要" }}</b>
          <span class="muted tnum">{{ dateText(selected.createdAt) }}</span>
        </div>

        <dl class="review-dl audit-meta">
          <dt>租户</dt><dd>{{ selected.tenantId || "平台" }}</dd>
          <dt>资源</dt><dd>{{ selected.resourceType }} / {{ selected.resourceId || "-" }}</dd>
          <dt>请求</dt><dd>{{ selected.requestId || "-" }}</dd>
          <dt>来源</dt><dd>{{ selected.ip || "-" }}</dd>
          <dt>UA</dt><dd>{{ selected.userAgent || "-" }}</dd>
          <dt v-if="selected.errorMessage">错误</dt><dd v-if="selected.errorMessage">{{ selected.errorMessage }}</dd>
        </dl>

        <section class="table-card diff-table">
          <table>
            <thead>
              <tr>
                <th>字段</th>
                <th>变更</th>
                <th>Before</th>
                <th>After</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in diffRows(selected)" :key="row.field">
                <td class="code">{{ row.field }}</td>
                <td><span class="tag purple">{{ row.type }}</span></td>
                <td class="audit-value">{{ row.before }}</td>
                <td class="audit-value">{{ row.after }}</td>
              </tr>
            </tbody>
          </table>
          <el-empty v-if="diffRows(selected).length === 0" description="暂无字段差异" />
        </section>
      </div>
      <div class="ft">
        <button class="btn" type="button" @click="closeDetail"><ShieldCheck /> 已阅</button>
      </div>
    </section>
  </div>
</template>
