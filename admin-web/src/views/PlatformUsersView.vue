<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Plus, RotateCcw } from "lucide-vue-next";
import {
  deactivatePlatformUserApi,
  platformUsersApi,
  type PlatformUser,
} from "@/api/platform-users";

const loading = ref(false);
const rows = ref<PlatformUser[]>([]);

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const data = await platformUsersApi();
    rows.value = data.list;
  } finally {
    loading.value = false;
  }
}

async function deactivate(row: PlatformUser) {
  await deactivatePlatformUserApi(row.id);
  await load();
}
</script>

<template>
  <section>
    <div class="toolbar">
      <div class="search-input">
        <input type="text" placeholder="搜索账号 / 角色" disabled />
      </div>
      <span class="spacer" style="flex: 1"></span>
      <button class="btn" type="button" :disabled="loading" @click="load">
        <RotateCcw />
        刷新
      </button>
      <button class="btn btn-primary" type="button" disabled>
        <Plus />
        新增用户
      </button>
    </div>

    <div class="table-card">
      <table>
        <thead>
          <tr>
            <th>账号</th>
            <th>角色</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>
              <b>{{ row.username }}</b>
              <span class="muted">{{ row.phone || "-" }}</span>
            </td>
            <td>
              <span
                v-for="r in row.roles"
                :key="r"
                class="tag purple"
                style="margin-right: 6px"
                >{{ r }}</span
              >
            </td>
            <td><span class="tag" :class="row.status === 'active' ? 'green' : 'amber'">{{ row.status }}</span></td>
            <td><button class="btn" type="button" @click="deactivate(row)">停用</button></td>
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
  padding: 36px 28px;
  text-align: center;
}

.empty :deep(svg) {
  width: 36px;
  height: 36px;
  color: var(--muted);
  opacity: 0.6;
}

.btn[disabled] {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
