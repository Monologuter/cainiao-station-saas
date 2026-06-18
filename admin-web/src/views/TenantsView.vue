<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { Plus, RotateCcw } from "lucide-vue-next";
import { tenantsApi, updateTenantStatusApi, type TenantRow } from "@/api/tenants";

const loading = ref(false);
const status = ref("");
const rows = ref<TenantRow[]>([]);

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const data = await tenantsApi({ status: status.value });
    rows.value = data.list;
  } finally {
    loading.value = false;
  }
}

async function setStatus(row: TenantRow, next: TenantRow["status"]) {
  await updateTenantStatusApi(row.id, next);
  ElMessage.success("租户状态已更新");
  await load();
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
      <button class="btn btn-primary" type="button" disabled>
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
    </div>
  </section>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 56px 28px;
  text-align: center;
}

.empty :deep(svg) {
  width: 40px;
  height: 40px;
  color: var(--muted);
  opacity: 0.6;
}

.empty b {
  font-size: 15px;
}

.btn[disabled] {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
