<script setup lang="ts">
import { UsersRound, Plus } from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
</script>

<template>
  <section>
    <div class="toolbar">
      <div class="search-input">
        <input type="text" placeholder="搜索账号 / 角色" />
      </div>
      <span class="spacer" style="flex: 1"></span>
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
            <th>类型</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="auth.user">
            <td>
              <b>{{ auth.user.username }}</b>
            </td>
            <td>
              <span
                v-for="r in auth.user.roles"
                :key="r"
                class="tag purple"
                style="margin-right: 6px"
                >{{ r }}</span
              >
            </td>
            <td>
              <span class="tag blue">{{
                auth.user.isPlatform ? "平台" : "租户"
              }}</span>
            </td>
            <td><span class="tag green">在线</span></td>
          </tr>
        </tbody>
      </table>
      <div class="empty">
        <UsersRound />
        <span class="muted"
          >平台用户管理后端接口（/admin/platform-users）待接入；当前仅展示登录账号自身，接口上线后将列出全部平台员工。</span
        >
      </div>
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
