<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { LogIn, Store } from 'lucide-vue-next';
import { ElMessage } from 'element-plus/es/components/message/index';
import { ApiError } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const loading = ref(false);
const form = reactive({
  username: '',
  password: '',
});

const redirect = computed(() =>
  typeof route.query.redirect === 'string' ? route.query.redirect : '/workbench',
);

async function submit() {
  if (!form.username || !form.password) {
    ElMessage.error('请输入账号和密码');
    return;
  }

  loading.value = true;
  try {
    await auth.login(form.username, form.password);
    await router.replace(redirect.value);
  } catch (error) {
    if (error instanceof ApiError) {
      ElMessage.error(error.message);
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-card">
      <div class="login-brand">
        <div class="logo">
          <Store :size="22" />
        </div>
        <div>
          <h1>驿小站</h1>
          <p>城南综合驿站运营工作台</p>
        </div>
      </div>

      <form class="login-form" @submit.prevent="submit">
        <label class="field">
          <span>账号 <i class="req">*</i></span>
          <input v-model.trim="form.username" class="input" autocomplete="username" />
        </label>
        <label class="field">
          <span>密码 <i class="req">*</i></span>
          <input
            v-model="form.password"
            class="input"
            type="password"
            autocomplete="current-password"
          />
        </label>
        <button class="btn btn-primary btn-lg login-submit" type="submit" :disabled="loading">
          <LogIn />
          {{ loading ? '登录中' : '登录' }}
        </button>
      </form>
    </section>
  </main>
</template>
