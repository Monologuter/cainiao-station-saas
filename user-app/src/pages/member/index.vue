<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { memberProfileApi, type MemberProfile } from '@/api/member';

const profile = ref<MemberProfile | null>(null);

onMounted(load);

async function load() {
  profile.value = await memberProfileApi();
}

function go(url: string) {
  uni.navigateTo({ url });
}
</script>

<template>
  <view class="mobile-page member-page">
    <view class="mobile-card member-hero">
      <text class="eyebrow">会员中心</text>
      <text class="member-points">{{ profile?.availablePoints ?? 0 }}</text>
      <text class="desc">可用积分 · LV{{ profile?.level ?? 0 }} · 连签 {{ profile?.continuousCheckinDays ?? 0 }} 天</text>
      <view class="progress-track">
        <view class="progress-fill" :style="{ width: `${profile?.progressPercent ?? 0}%` }" />
      </view>
    </view>

    <view class="member-grid">
      <button class="mobile-card member-entry" type="button" @click="go('/pages/member/checkin')">
        <text class="entry-title">每日签到</text>
        <text class="entry-desc">连续签到加成</text>
      </button>
      <button class="mobile-card member-entry" type="button" @click="go('/pages/member/points')">
        <text class="entry-title">积分明细</text>
        <text class="entry-desc">得分与消耗</text>
      </button>
      <button class="mobile-card member-entry" type="button" @click="go('/pages/member/coupons')">
        <text class="entry-title">我的券包</text>
        <text class="entry-desc">兑换与使用</text>
      </button>
      <button class="mobile-card member-entry" type="button" @click="go('/pages/member/reviews')">
        <text class="entry-title">我的评价</text>
        <text class="entry-desc">反馈服务体验</text>
      </button>
      <button class="mobile-card member-entry" type="button" @click="go('/pages/member/complaints')">
        <text class="entry-title">投诉进度</text>
        <text class="entry-desc">查看处理状态</text>
      </button>
    </view>
  </view>
</template>
