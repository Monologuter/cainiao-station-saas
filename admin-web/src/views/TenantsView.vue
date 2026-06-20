<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { useRoute } from "vue-router";
import { Building2, Plus, RotateCcw } from "lucide-vue-next";
import {
  createTenantApi,
  tenantsApi,
  updateTenantStatusApi,
  type TenantRow,
} from "@/api/tenants";
import { tenantStatusMeta } from "@/utils/status-labels";

const loading = ref(false);
const route = useRoute();
const status = ref("");
const keyword = ref("");
const rows = ref<TenantRow[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(20);

const modalOpen = ref(false);
const saving = ref(false);
const form = reactive({
  name: "",
  ownerName: "",
  ownerPhone: "",
  ownerPassword: "",
});

onMounted(() => {
  applyRouteKeyword(route.query.keyword);
  load();
});

watch(
  () => route.query.keyword,
  async (value) => {
    if (applyRouteKeyword(value)) {
      page.value = 1;
      await load();
    }
  },
);

async function load() {
  loading.value = true;
  try {
    const data = await tenantsApi({
      status: status.value,
      keyword: keyword.value,
      page: page.value,
      size: size.value,
    });
    rows.value = data.list;
    total.value = data.total;
  } catch (error) {
    ElMessage.error(errorText(error, "加载租户列表失败"));
  } finally {
    loading.value = false;
  }
}

async function filterByStatus() {
  page.value = 1;
  await load();
}

function applyRouteKeyword(value: unknown) {
  const next = typeof value === "string" ? value.trim() : "";
  if (keyword.value === next) {
    return false;
  }
  keyword.value = next;
  return true;
}

async function changePage(nextPage: number) {
  if (nextPage < 1 || nextPage > totalPages.value || nextPage === page.value) {
    return;
  }
  page.value = nextPage;
  await load();
}

async function setStatus(row: TenantRow, next: TenantRow["status"]) {
  try {
    await updateTenantStatusApi(row.id, next);
    ElMessage.success("租户状态已更新");
    await load();
  } catch (error) {
    ElMessage.error(errorText(error, "更新租户状态失败"));
  }
}

function openCreate() {
  Object.assign(form, {
    name: "",
    ownerName: "",
    ownerPhone: "",
    ownerPassword: "",
  });
  modalOpen.value = true;
}

async function submit() {
  if (!form.name.trim() || !form.ownerName.trim() || !form.ownerPhone.trim()) {
    ElMessage.error("请填写租户名称、负责人与手机号");
    return;
  }
  if (form.ownerPassword.length < 6) {
    ElMessage.error("初始密码至少 6 位");
    return;
  }
  saving.value = true;
  try {
    await createTenantApi({
      name: form.name.trim(),
      ownerName: form.ownerName.trim(),
      ownerPhone: form.ownerPhone.trim(),
      ownerPassword: form.ownerPassword,
    });
    ElMessage.success("租户已创建");
    modalOpen.value = false;
    await load();
  } catch (error) {
    ElMessage.error(errorText(error, "创建租户失败"));
  } finally {
    saving.value = false;
  }
}

function errorText(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

const totalPages = computed(() =>
  Math.max(1, Math.ceil(total.value / size.value)),
);
</script>

<template>
  <section>
    <div class="toolbar">
      <div class="search-input">
        <select v-model="status" @change="filterByStatus">
          <option value="">全部状态</option>
          <option value="ACTIVE">正常</option>
          <option value="SUSPENDED">停用</option>
          <option value="CLOSED">关闭</option>
        </select>
      </div>
      <span class="spacer" style="flex: 1"></span>
      <button class="btn" type="button" :disabled="loading" @click="load">
        <RotateCcw />
        刷新
      </button>
      <button class="btn btn-primary" type="button" @click="openCreate">
        <Plus />
        新建租户
      </button>
    </div>

    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th>租户</th>
            <th>负责人</th>
            <th>门店/用户</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td><b>{{ row.name }}</b><span class="muted">{{ row.id.slice(0, 8) }}</span></td>
            <td>{{ row.ownerName }} · {{ row.contactPhone }}</td>
            <td>{{ row.stationCount }} / {{ row.userCount }}</td>
            <td>
              <span class="tag" :class="tenantStatusMeta(row.status).tag">
                {{ tenantStatusMeta(row.status).label }}
              </span>
            </td>
            <td>
              <button
                class="btn"
                type="button"
                @click="setStatus(row, row.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')"
              >
                {{ row.status === "ACTIVE" ? "停用" : "启用" }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <el-empty v-if="!loading && rows.length === 0" description="暂无租户" />
      <div class="pager" aria-label="租户分页">
        <span>共 {{ total }} 个租户，第 {{ page }} / {{ totalPages }} 页</span>
        <button class="btn" type="button" :disabled="page <= 1 || loading" @click="changePage(page - 1)">
          上一页
        </button>
        <button
          class="btn"
          type="button"
          :disabled="page >= totalPages || loading"
          @click="changePage(page + 1)"
        >
          下一页
        </button>
      </div>
    </div>

    <div v-if="modalOpen" class="mask" @click.self="modalOpen = false">
      <section class="modal">
        <div class="hd">
          <h3>新建租户</h3>
          <button class="btn btn-ghost" type="button" @click="modalOpen = false">关闭</button>
        </div>
        <div class="bd form-grid">
          <div class="field" style="grid-column: 1 / -1">
            <label>租户名称</label>
            <input v-model.trim="form.name" class="input" placeholder="例如：星海驿站" />
          </div>
          <div class="field">
            <label>负责人</label>
            <input v-model.trim="form.ownerName" class="input" placeholder="店长姓名" />
          </div>
          <div class="field">
            <label>负责人手机号</label>
            <input v-model.trim="form.ownerPhone" class="input" placeholder="11 位手机号" />
          </div>
          <div class="field" style="grid-column: 1 / -1">
            <label>初始密码</label>
            <input v-model="form.ownerPassword" class="input" type="password" placeholder="至少 6 位" />
          </div>
        </div>
        <div class="ft">
          <button class="btn" type="button" @click="modalOpen = false">取消</button>
          <button class="btn btn-primary" type="button" :disabled="saving" @click="submit">
            <Building2 />
            创建租户
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.btn[disabled] {
  cursor: not-allowed;
  opacity: 0.6;
}

.pager {
  align-items: center;
  border-top: 1px solid var(--line);
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 12px 14px;
}

.pager span {
  color: var(--muted);
  font-size: 13px;
  margin-right: auto;
}
</style>
