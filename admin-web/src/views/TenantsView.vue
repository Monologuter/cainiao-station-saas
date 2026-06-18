<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { Building2, Plus, RotateCcw } from "lucide-vue-next";
import {
  createTenantApi,
  tenantsApi,
  updateTenantStatusApi,
  type TenantRow,
} from "@/api/tenants";

const loading = ref(false);
const status = ref("");
const rows = ref<TenantRow[]>([]);

const modalOpen = ref(false);
const saving = ref(false);
const form = reactive({
  name: "",
  ownerName: "",
  ownerPhone: "",
  ownerPassword: "",
});

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const data = await tenantsApi({ status: status.value });
    rows.value = data.list;
  } catch (error) {
    ElMessage.error(errorText(error, "加载租户列表失败"));
  } finally {
    loading.value = false;
  }
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
</script>

<template>
  <section>
    <div class="toolbar">
      <div class="search-input">
        <select v-model="status" @change="load">
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
            <td><span class="tag" :class="row.status === 'ACTIVE' ? 'green' : 'amber'">{{ row.status }}</span></td>
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
</style>
