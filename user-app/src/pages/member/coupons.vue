<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  couponStatusLabel,
  couponTemplatesApi,
  couponsApi,
  redeemCouponApi,
  type Coupon,
  type CouponTemplate,
} from '@/api/member';

const coupons = ref<Coupon[]>([]);
const templates = ref<CouponTemplate[]>([]);

onMounted(load);

async function load() {
  coupons.value = (await couponsApi()).list;
  templates.value = (await couponTemplatesApi()).list;
}

async function redeem(id: string) {
  await redeemCouponApi(id);
  uni.showToast({ title: '兑换成功', icon: 'none' });
  await load();
}
</script>

<template>
  <view class="mobile-page">
    <view class="mobile-card hero-card">
      <text class="eyebrow">我的券包</text>
      <text class="title">{{ coupons.length }} 张券</text>
      <text class="desc">可用券会在取件、寄件等场景抵扣。</text>
    </view>

    <view v-for="coupon in coupons" :key="coupon.id" class="mobile-card coupon-card">
      <text class="entry-title">{{ coupon.template?.name ?? '优惠券' }}</text>
      <text class="parcel-meta">{{ couponStatusLabel(coupon.status) }} · {{ coupon.expireAt?.slice(0, 10) }}</text>
    </view>

    <view class="mobile-card form-card">
      <text class="section-title">可兑换</text>
      <view v-for="template in templates" :key="template.id" class="coupon-exchange">
        <view>
          <text class="entry-title">{{ template.name }}</text>
          <text class="parcel-meta">{{ template.costPoints ?? 0 }} 积分 · 有效 {{ template.validDays }} 天</text>
        </view>
        <button class="mini-btn" type="button" @click="redeem(template.id)">兑换</button>
      </view>
    </view>
  </view>
</template>
