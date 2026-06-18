<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useUserStore } from '@/stores/user';

const user = useUserStore();
const loading = ref(false);
const form = reactive({
  phone: '',
  code: '123456',
});

async function sendCode() {
  if (!/^1\d{10}$/.test(form.phone)) {
    uni.showToast({ title: '请输入正确手机号', icon: 'none' });
    return;
  }
  await user.sendCode(form.phone);
  uni.showToast({ title: '验证码已发送', icon: 'none' });
}

async function login() {
  loading.value = true;
  try {
    await user.verifyCode(form.phone, form.code);
    uni.reLaunch({ url: '/pages/home/index' });
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <view class="mobile-page login-mobile">
    <view class="mobile-card hero-card">
      <text class="eyebrow">驿小站</text>
      <text class="title">取件码随身带</text>
      <text class="desc">手机号验证后，可跨门店查看自己的包裹。</text>
    </view>

    <view class="mobile-card form-card">
      <input v-model="form.phone" class="mobile-input" placeholder="手机号" type="number" aria-label="手机号" />
      <view class="code-row">
        <input v-model="form.code" class="mobile-input" placeholder="验证码" type="number" aria-label="短信验证码" />
        <button class="mini-btn" type="button" aria-label="获取短信验证码" @click="sendCode">发码</button>
      </view>
      <button class="primary-btn" type="button" :disabled="loading" @click="login">
        {{ loading ? '登录中' : '登录查件' }}
      </button>
    </view>
  </view>
</template>
