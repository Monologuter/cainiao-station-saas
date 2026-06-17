<script setup lang="ts">
import { computed } from 'vue';
import { LockKeyhole, UserRoundPlus } from 'lucide-vue-next';
import { groupPermissions } from '@/constants/perms';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const groups = computed(() => groupPermissions(auth.perms));
const roleNames = computed(() => auth.user?.roles ?? []);
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">网点管理 / 员工权限</div>
      <h1>员工权限</h1>
    </div>
    <button class="btn btn-primary" type="button" disabled>
      <UserRoundPlus />
      新增员工
    </button>
  </section>

  <section class="staff-grid">
    <article class="table-card">
      <div class="card-hd">
        <h2>当前账号角色</h2>
        <span class="tag gray">员工 CRUD 待后端接口</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>账号</th>
            <th>角色</th>
            <th>租户</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{{ auth.user?.username ?? '-' }}</td>
            <td>
              <span v-for="role in roleNames" :key="role" class="tag blue role-tag">
                <span class="d"></span>{{ role }}
              </span>
            </td>
            <td class="tnum">{{ auth.user?.tenantId ?? '平台' }}</td>
            <td><span class="tag green"><span class="d"></span>启用</span></td>
          </tr>
        </tbody>
      </table>
    </article>

    <article class="card">
      <div class="hd">
        <h2>权限树</h2>
        <LockKeyhole :size="18" />
      </div>
      <div class="bd perm-groups">
        <section v-for="group in groups" :key="group.module" class="perm-group">
          <h3>{{ group.module }}</h3>
          <div class="perm-list">
            <span v-for="item in group.items" :key="item.code" class="perm-item">
              <span class="switch on"></span>
              <span>
                <b>{{ item.name }}</b>
                <em>{{ item.code }}</em>
              </span>
            </span>
          </div>
        </section>
      </div>
    </article>
  </section>
</template>
