<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { memberProfileApi, couponsApi, type MemberProfile } from '@/api/member';
import { useParcelStore } from '@/stores/parcel';
import { useShippingStore } from '@/stores/shipping';
import { useUserStore } from '@/stores/user';
import { toastError } from '@/utils/request';

const user = useUserStore();
const parcel = useParcelStore();
const shipping = useShippingStore();

const profile = ref<MemberProfile | null>(null);
const loading = ref(false);
const error = ref('');

const storedCount = ref<number | null>(null);
const pickedCount = ref<number | null>(null);
const shipCount = ref<number | null>(null);
const couponCount = ref<number | null>(null);

const phoneTail = computed(() => {
  const phone = profile.value?.phone || user.phone;
  return phone ? phone.slice(-4) : '----';
});

const levelLabel = computed(() => {
  const level = profile.value?.level;
  return level !== undefined && level !== null ? `LV${level} 会员` : '普通会员';
});

const stat = (value: number | null) => (value === null ? '-' : String(value));

onMounted(load);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    profile.value = await memberProfileApi();
  } catch (err) {
    error.value = err instanceof Error ? err.message : '资料加载失败';
    toastError(err, '资料加载失败');
  } finally {
    loading.value = false;
  }

  // 各项统计独立加载，单项失败不阻塞页面，接不上则显示占位 "-"
  parcel
    .load('STORED')
    .then((res) => (storedCount.value = res.total ?? res.list.length))
    .catch(() => (storedCount.value = null));
  parcel
    .load('PICKED_UP')
    .then((res) => (pickedCount.value = res.total ?? res.list.length))
    .catch(() => (pickedCount.value = null));
  shipping
    .load({ page: 1, size: 1 })
    .then((res) => (shipCount.value = res.total ?? res.list.length))
    .catch(() => (shipCount.value = null));
  couponsApi('UNUSED')
    .then((res) => (couponCount.value = res.total ?? res.list.length))
    .catch(() => (couponCount.value = null));
}

function go(url: string) {
  uni.navigateTo({ url });
}

function confirmLogout() {
  uni.showModal({
    title: '退出登录',
    content: '退出后需重新输入手机号验证才能查件，确定退出？',
    success(res) {
      if (res.confirm) {
        user.logout();
        uni.reLaunch({ url: '/pages/login/index' });
      }
    },
  });
}
</script>

<template>
  <view class="mobile-page profile-page">
    <!-- 用户卡 -->
    <view class="mobile-card profile-hero">
      <view class="profile-id">
        <view class="profile-avatar" aria-hidden="true">
          <text class="avatar-glyph">驿</text>
        </view>
        <view class="profile-who">
          <view class="profile-name-row">
            <text class="profile-name">驿小站用户</text>
            <text class="profile-level">{{ levelLabel }}</text>
          </view>
          <text class="profile-phone">手机尾号 {{ phoneTail }}</text>
        </view>
      </view>

      <view class="profile-points">
        <view class="points-left">
          <text class="points-num">{{ profile?.availablePoints ?? 0 }}</text>
          <text class="points-lab">可用积分 · 连签 {{ profile?.continuousCheckinDays ?? 0 }} 天</text>
        </view>
        <button class="points-redeem" type="button" @click="go('/pages/member/coupons')">去兑换</button>
      </view>
    </view>

    <view v-if="error" class="mobile-card empty-mobile" role="alert">
      {{ error }}，<text class="retry-link" @click="load">点击重试</text>
    </view>

    <!-- 数据宫格 -->
    <view class="mobile-card profile-grid">
      <view class="grid-cell" @click="go('/pages/parcels/index')">
        <text class="grid-num hot">{{ stat(storedCount) }}</text>
        <text class="grid-lab">待取</text>
      </view>
      <view class="grid-cell" @click="go('/pages/parcels/index')">
        <text class="grid-num">{{ stat(pickedCount) }}</text>
        <text class="grid-lab">已取</text>
      </view>
      <view class="grid-cell" @click="go('/pages/ship-orders/index')">
        <text class="grid-num">{{ stat(shipCount) }}</text>
        <text class="grid-lab">寄件</text>
      </view>
      <view class="grid-cell" @click="go('/pages/member/coupons')">
        <text class="grid-num">{{ stat(couponCount) }}</text>
        <text class="grid-lab">优惠券</text>
      </view>
    </view>

    <!-- 我的服务 -->
    <text class="profile-sec-cap">我的服务</text>
    <view class="mobile-card profile-group">
      <button class="profile-row" type="button" @click="go('/pages/parcels/index')">
        <text class="row-title">我的包裹</text>
        <text class="row-chev">›</text>
      </button>
      <button class="profile-row" type="button" @click="go('/pages/ship-orders/index')">
        <text class="row-title">我的寄件</text>
        <text class="row-chev">›</text>
      </button>
      <button class="profile-row" type="button" @click="go('/pages/authorize/index')">
        <text class="row-title">代取授权</text>
        <text class="row-chev">›</text>
      </button>
    </view>

    <!-- 会员权益 -->
    <text class="profile-sec-cap">会员权益</text>
    <view class="mobile-card profile-group">
      <button class="profile-row" type="button" @click="go('/pages/member/points')">
        <text class="row-title">我的积分</text>
        <text class="row-sub">{{ profile?.availablePoints ?? 0 }}</text>
        <text class="row-chev">›</text>
      </button>
      <button class="profile-row" type="button" @click="go('/pages/member/coupons')">
        <text class="row-title">优惠券</text>
        <text class="row-sub">{{ stat(couponCount) }} 张可用</text>
        <text class="row-chev">›</text>
      </button>
      <button class="profile-row" type="button" @click="go('/pages/member/index')">
        <text class="row-title">会员中心</text>
        <text class="row-chev">›</text>
      </button>
    </view>

    <!-- 其他 -->
    <text class="profile-sec-cap">其他</text>
    <view class="mobile-card profile-group">
      <button class="profile-row" type="button" @click="go('/pages/assistant/index')">
        <text class="row-title">帮助与客服</text>
        <text class="row-chev">›</text>
      </button>
      <button class="profile-row" type="button" @click="go('/pages/messages/index')">
        <text class="row-title">消息通知</text>
        <text class="row-chev">›</text>
      </button>
      <view class="profile-row about-row">
        <text class="row-title">关于</text>
        <text class="row-sub">驿小站 H5</text>
      </view>
    </view>

    <button class="logout-btn" type="button" @click="confirmLogout">退出登录</button>
  </view>
</template>

<style scoped>
.profile-page {
  padding-bottom: 40px;
}

.profile-hero {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px;
  border-color: var(--primary-line);
  background: var(--hero-grad);
}

.profile-id {
  display: flex;
  align-items: center;
  gap: 14px;
}

.profile-avatar {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border-radius: var(--radius-md);
  background: var(--primary-soft);
  flex-shrink: 0;
}

.avatar-glyph {
  color: var(--primary);
  font-size: 26px;
  font-weight: 900;
}

.profile-who {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.profile-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.profile-name {
  color: var(--text);
  font-size: 19px;
  font-weight: 800;
}

.profile-level {
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  color: var(--warn);
  background: var(--warn-soft);
  font-size: 11px;
  font-weight: 700;
}

.profile-phone {
  color: var(--muted);
  font-size: 13px;
}

.profile-points {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius-lg);
  background: var(--primary-soft);
}

.points-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.points-num {
  color: var(--primary);
  font-size: 26px;
  font-weight: 900;
  line-height: 1.1;
}

.points-lab {
  color: var(--muted);
  font-size: 12px;
}

.points-redeem {
  height: 32px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--radius-pill);
  color: var(--primary-fg);
  background: var(--primary);
  font-size: 13px;
  font-weight: 700;
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  margin-top: 14px;
  padding: 18px 4px;
}

.grid-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.grid-num {
  color: var(--text);
  font-size: 21px;
  font-weight: 800;
}

.grid-num.hot {
  color: var(--primary);
}

.grid-lab {
  color: var(--muted);
  font-size: 12px;
}

.profile-sec-cap {
  display: block;
  padding: 18px 6px 8px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.profile-group {
  overflow: hidden;
  padding: 0;
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  padding: 14px 16px;
  border: 0;
  border-bottom: 1px solid var(--border-2);
  background: var(--surface);
  text-align: left;
}

.profile-row:last-child {
  border-bottom: 0;
}

.row-title {
  flex: 1;
  color: var(--text);
  font-size: 15px;
  font-weight: 600;
}

.row-sub {
  color: var(--muted);
  font-size: 13px;
}

.row-chev {
  color: var(--muted);
  font-size: 20px;
  line-height: 1;
}

.about-row {
  pointer-events: none;
}

.logout-btn {
  width: 100%;
  height: 48px;
  margin-top: 22px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--danger);
  background: var(--surface);
  font-size: 15px;
  font-weight: 700;
}
</style>
