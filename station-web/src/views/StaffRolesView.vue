<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index';
import { LockKeyhole, UserRoundPlus } from 'lucide-vue-next';
import { groupPermissions } from '@/constants/perms';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const groups = computed(() => groupPermissions(auth.perms));
const roleNames = computed(() => auth.user?.roles ?? []);
const createStaffOpen = ref(false);
const staffForm = reactive({
  username: '',
  phone: '',
  role: '店员',
});

function openCreateStaff() {
  createStaffOpen.value = true;
}

function closeCreateStaff() {
  createStaffOpen.value = false;
}

function submitCreateStaff() {
  if (!staffForm.username.trim()) {
    ElMessage.error('请填写员工登录账号');
    return;
  }
  if (!/^1\d{10}$/.test(staffForm.phone)) {
    ElMessage.error('请输入 11 位手机号');
    return;
  }
  ElMessage.info('员工创建接口待接入，表单入口已可用');
}
</script>

<template>
  <section class="page-hd">
    <div>
      <div class="crumb">网点管理 / 员工权限</div>
      <h1>员工权限</h1>
    </div>
    <button class="btn btn-primary" type="button" data-testid="create-staff" @click="openCreateStaff">
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

  <div v-if="createStaffOpen" class="mask" data-testid="staff-modal" @click.self="closeCreateStaff">
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="staff-create-title">
      <div class="hd">
        <h3 id="staff-create-title">新增员工</h3>
        <button class="btn btn-ghost" type="button" @click="closeCreateStaff">关闭</button>
      </div>
      <form @submit.prevent="submitCreateStaff">
        <div class="bd form-grid">
          <label class="field">
            <span>账号</span>
            <input
              v-model.trim="staffForm.username"
              class="input"
              autocomplete="off"
              placeholder="员工登录账号"
            />
          </label>
          <label class="field">
            <span>手机号</span>
            <input
              v-model.trim="staffForm.phone"
              class="input"
              autocomplete="off"
              inputmode="numeric"
              maxlength="11"
              placeholder="11 位手机号"
            />
          </label>
          <label class="field span-2">
            <span>角色</span>
            <select v-model="staffForm.role" class="input">
              <option value="店员">店员</option>
              <option value="店长">店长</option>
            </select>
          </label>
        </div>
        <div class="ft">
          <button class="btn btn-ghost" type="button" @click="closeCreateStaff">取消</button>
          <button class="btn btn-primary" type="submit">保存员工</button>
        </div>
      </form>
    </section>
  </div>
</template>
