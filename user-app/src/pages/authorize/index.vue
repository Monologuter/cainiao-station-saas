<script setup lang="ts">
import { reactive, ref } from 'vue';

type Scope = 'ALL' | 'SELECTED';
type Validity = 'ONCE' | 'WEEK' | 'LONG';

interface Delegation {
  id: string;
  alias: string;
  phoneTail: string;
  scopeLabel: string;
  validityLabel: string;
}

const scopeOptions: { value: Scope; title: string; desc: string }[] = [
  { value: 'ALL', title: '全部待取包裹', desc: '对方可代取您名下所有在库包裹' },
  { value: 'SELECTED', title: '指定包裹', desc: '仅授权您勾选的特定包裹' },
];

const validityOptions: { value: Validity; label: string }[] = [
  { value: 'ONCE', label: '本次有效（取件后失效）' },
  { value: 'WEEK', label: '7 天内有效' },
  { value: 'LONG', label: '长期有效' },
];

const form = reactive({
  phone: '',
  alias: '',
  scope: 'ALL' as Scope,
  validity: 'WEEK' as Validity,
});

// 后端暂未提供消费者代取授权管理接口，列表先用空态，接口就绪后接入。
const delegations = ref<Delegation[]>([]);
const submitting = ref(false);

function selectScope(value: Scope) {
  form.scope = value;
}

function submit() {
  if (!/^1\d{10}$/.test(form.phone)) {
    uni.showToast({ title: '请输入正确的被授权人手机号', icon: 'none' });
    return;
  }
  submitting.value = true;
  // TODO: 接入 POST /api/member/pickup-authorizations 后改为真实请求
  uni.showToast({ title: '代取授权功能即将上线', icon: 'none' });
  submitting.value = false;
}

function revoke(id: string) {
  uni.showModal({
    title: '撤销授权',
    content: '撤销后对方将无法继续代取，确定撤销？',
    success(res) {
      if (res.confirm) {
        // TODO: 接入 DELETE /api/member/pickup-authorizations/:id
        delegations.value = delegations.value.filter((item) => item.id !== id);
        uni.showToast({ title: '已撤销', icon: 'none' });
      }
    },
  });
}
</script>

<template>
  <view class="mobile-page authorize-page">
    <!-- 说明卡 -->
    <view class="mobile-card auth-intro">
      <text class="auth-intro-title">什么是代取授权</text>
      <text class="auth-intro-desc">
        授权家人 / 朋友凭其取件码代您取件，授权后对方可在其端内看到您指定的包裹。
      </text>
    </view>

    <!-- 添加授权 -->
    <text class="section-title auth-sec">添加授权</text>
    <view class="mobile-card form-card auth-form">
      <view class="auth-field">
        <text class="auth-label">被授权人手机号 <text class="req">*</text></text>
        <input
          v-model="form.phone"
          class="mobile-input"
          type="number"
          placeholder="请输入对方手机号"
          aria-label="被授权人手机号"
        />
      </view>

      <view class="auth-field">
        <text class="auth-label">称呼</text>
        <input
          v-model="form.alias"
          class="mobile-input"
          placeholder="如 家人 / 室友 / 同事"
          aria-label="被授权人称呼"
        />
      </view>

      <view class="auth-field">
        <text class="auth-label">授权范围 <text class="req">*</text></text>
        <view class="radio-group">
          <button
            v-for="opt in scopeOptions"
            :key="opt.value"
            class="radio-opt"
            :class="{ on: form.scope === opt.value }"
            type="button"
            :aria-label="opt.title"
            @click="selectScope(opt.value)"
          >
            <view class="radio-dot" :class="{ on: form.scope === opt.value }" aria-hidden="true" />
            <view class="radio-text">
              <text class="radio-title">{{ opt.title }}</text>
              <text class="radio-desc">{{ opt.desc }}</text>
            </view>
          </button>
        </view>
      </view>

      <view class="auth-field">
        <text class="auth-label">有效期 <text class="req">*</text></text>
        <picker
          mode="selector"
          :range="validityOptions"
          range-key="label"
          :value="validityOptions.findIndex((o) => o.value === form.validity)"
          @change="form.validity = validityOptions[Number($event.detail.value)].value"
        >
          <view class="auth-picker" aria-label="授权有效期">
            <text>{{ validityOptions.find((o) => o.value === form.validity)?.label }}</text>
            <text class="picker-chev">▾</text>
          </view>
        </picker>
      </view>

      <button class="primary-btn auth-submit" type="button" :disabled="submitting" @click="submit">
        确认授权
      </button>
    </view>

    <!-- 已授权 -->
    <view class="auth-list-head">
      <text class="section-title">已授权</text>
      <text class="auth-count">共 {{ delegations.length }} 人</text>
    </view>

    <view v-if="delegations.length === 0" class="mobile-card msg-empty">
      <text class="msg-empty-glyph" aria-hidden="true">👥</text>
      <text class="msg-empty-title">暂无授权记录</text>
      <text class="msg-empty-desc">添加授权后，被授权人会显示在这里</text>
    </view>

    <view v-else class="auth-list">
      <view v-for="item in delegations" :key="item.id" class="mobile-card auth-item">
        <view class="auth-item-top">
          <view class="auth-who">
            <text class="auth-who-name">{{ item.alias }}</text>
            <text class="auth-who-phone">手机尾号 ****{{ item.phoneTail }}</text>
          </view>
          <button class="auth-revoke" type="button" @click="revoke(item.id)">撤销</button>
        </view>
        <view class="auth-item-meta">
          <text class="mini-tag gray">{{ item.scopeLabel }}</text>
          <text class="mini-tag blue">{{ item.validityLabel }}</text>
        </view>
      </view>
    </view>

    <text class="auth-foot">授权信息仅用于代取核销 · 可随时撤销</text>
  </view>
</template>

<style scoped>
.authorize-page {
  padding-bottom: 36px;
}

.auth-intro {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border-color: var(--primary-line);
  background: var(--hero-grad);
}

.auth-intro-title {
  color: var(--text);
  font-size: 15px;
  font-weight: 800;
}

.auth-intro-desc {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

.auth-sec {
  display: block;
  margin: 18px 2px 10px;
}

.auth-form {
  gap: 16px;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.auth-label {
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
}

.req {
  color: var(--danger);
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.radio-opt {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 0 14px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  text-align: left;
}

.radio-opt.on {
  border-color: var(--primary);
  background: var(--primary-soft);
}

.radio-dot {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-radius: 50%;
  flex-shrink: 0;
}

.radio-dot.on {
  border-color: var(--primary);
}

.radio-dot.on::after {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--primary);
  content: '';
}

.radio-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.radio-title {
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
}

.radio-desc {
  color: var(--muted);
  font-size: 11px;
}

.auth-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 46px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface);
  font-size: 15px;
}

.picker-chev {
  color: var(--muted);
}

.auth-submit {
  margin-top: 4px;
}

.auth-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 22px 2px 12px;
}

.auth-count {
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}

.auth-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.auth-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 15px;
}

.auth-item-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.auth-who {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.auth-who-name {
  color: var(--text);
  font-size: 15px;
  font-weight: 700;
}

.auth-who-phone {
  color: var(--muted);
  font-size: 12px;
}

.auth-revoke {
  height: 34px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--radius-xs);
  color: var(--danger);
  background: var(--danger-soft);
  font-size: 13px;
  font-weight: 700;
}

.auth-item-meta {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
}

.auth-foot {
  display: block;
  margin-top: 20px;
  color: var(--muted);
  font-size: 11px;
  text-align: center;
  line-height: 1.6;
}
</style>
