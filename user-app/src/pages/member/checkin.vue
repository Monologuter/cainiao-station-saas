<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { checkinApi, checkinRewardLabel, checkinStatusApi, type CheckinStatus } from '@/api/member';

const status = ref<CheckinStatus | null>(null);
const rewardText = ref('');

onMounted(load);

async function load() {
  const month = new Date().toISOString().slice(0, 7);
  status.value = await checkinStatusApi(month);
}

async function doCheckin() {
  const result = await checkinApi();
  rewardText.value = checkinRewardLabel(result.rewardPoints, result.continuousDays);
  await load();
  uni.showToast({ title: '签到成功', icon: 'none' });
}
</script>

<template>
  <view class="mobile-page">
    <view class="mobile-card hero-card">
      <text class="eyebrow">每日签到</text>
      <text class="title">{{ status?.checkedToday ? '今日已签到' : '今天还未签到' }}</text>
      <text class="desc">{{ rewardText || '签到可获得积分，连签奖励逐日增加。' }}</text>
      <button class="primary-btn home-action" type="button" :disabled="status?.checkedToday" @click="doCheckin">
        {{ status?.checkedToday ? '已完成' : '立即签到' }}
      </button>
    </view>

    <view class="mobile-card form-card">
      <text class="section-title">本月签到</text>
      <view class="date-cloud">
        <text v-for="date in status?.dates ?? []" :key="date" class="date-pill">{{ date.slice(5) }}</text>
      </view>
    </view>
  </view>
</template>
