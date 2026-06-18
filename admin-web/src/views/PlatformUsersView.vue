<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { Plus, RotateCcw, UserPlus } from "lucide-vue-next";
import {
  createPlatformUserApi,
  deactivatePlatformUserApi,
  platformUsersApi,
  type PlatformUser,
} from "@/api/platform-users";

const loading = ref(false);
const rows = ref<PlatformUser[]>([]);
const keyword = ref("");

const modalOpen = ref(false);
const saving = ref(false);
const form = reactive({
  username: "",
  password: "",
  phone: "",
  roleCodes: "",
});

const filteredRows = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return rows.value;
  return rows.value.filter((row) => {
    const haystack = [row.username, row.phone ?? "", ...row.roles]
      .join(" ")
      .toLowerCase();
    return haystack.includes(kw);
  });
});

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const data = await platformUsersApi();
    rows.value = data.list;
  } catch (error) {
    ElMessage.error(errorText(error, "加载平台用户失败"));
  } finally {
    loading.value = false;
  }
}

async function deactivate(row: PlatformUser) {
  try {
    await deactivatePlatformUserApi(row.id);
    ElMessage.success("用户已停用");
    await load();
  } catch (error) {
    ElMessage.error(errorText(error, "停用用户失败"));
  }
}

function openCreate() {
  Object.assign(form, { username: "", password: "", phone: "", roleCodes: "" });
  modalOpen.value = true;
}

async function submit() {
  if (!form.username.trim()) {
    ElMessage.error("请填写账号");
    return;
  }
  if (form.password.length < 6) {
    ElMessage.error("初始密码至少 6 位");
    return;
  }
  const roleCodes = form.roleCodes
    .split(/[,，\s]+/)
    .map((code) => code.trim())
    .filter(Boolean);
  saving.value = true;
  try {
    await createPlatformUserApi({
      username: form.username.trim(),
      password: form.password,
      phone: form.phone.trim() || undefined,
      roleCodes: roleCodes.length ? roleCodes : undefined,
    });
    ElMessage.success("用户已创建");
    modalOpen.value = false;
    await load();
  } catch (error) {
    ElMessage.error(errorText(error, "创建用户失败"));
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
        <input
          v-model.trim="keyword"
          type="text"
          placeholder="搜索账号 / 角色"
        />
      </div>
      <span class="spacer" style="flex: 1"></span>
      <button class="btn" type="button" :disabled="loading" @click="load">
        <RotateCcw />
        刷新
      </button>
      <button class="btn btn-primary" type="button" @click="openCreate">
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
          <tr v-for="row in filteredRows" :key="row.id">
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
      <el-empty
        v-if="!loading && filteredRows.length === 0"
        :description="keyword ? '没有匹配的用户' : '暂无平台用户'"
      />
    </div>

    <div v-if="modalOpen" class="mask" @click.self="modalOpen = false">
      <section class="modal">
        <div class="hd">
          <h3>新增平台用户</h3>
          <button class="btn btn-ghost" type="button" @click="modalOpen = false">关闭</button>
        </div>
        <div class="bd form-grid">
          <div class="field">
            <label>账号</label>
            <input v-model.trim="form.username" class="input" placeholder="登录账号" />
          </div>
          <div class="field">
            <label>手机号</label>
            <input v-model.trim="form.phone" class="input" placeholder="可选" />
          </div>
          <div class="field">
            <label>初始密码</label>
            <input v-model="form.password" class="input" type="password" placeholder="至少 6 位" />
          </div>
          <div class="field">
            <label>角色</label>
            <input v-model.trim="form.roleCodes" class="input" placeholder="逗号分隔，可选" />
          </div>
        </div>
        <div class="ft">
          <button class="btn" type="button" @click="modalOpen = false">取消</button>
          <button class="btn btn-primary" type="button" :disabled="saving" @click="submit">
            <UserPlus />
            创建用户
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
