<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { pointRecordsApi, pointTypeLabel, type PointRecord } from '@/api/member';

const list = ref<PointRecord[]>([]);

onMounted(async () => {
  list.value = (await pointRecordsApi({ page: 1, size: 50 })).list;
});
</script>

<template>
  <view class="mobile-page">
    <view class="mobile-card hero-card">
      <text class="eyebrow">积分明细</text>
      <text class="title">每一分都有来路</text>
      <text class="desc">取件、寄件、签到与兑换都会记录在这里。</text>
    </view>

    <view v-if="list.length === 0" class="mobile-card empty-mobile">暂无积分流水</view>
    <view v-for="item in list" :key="item.id" class="mobile-card point-row">
      <view>
        <text class="entry-title">{{ pointTypeLabel(item.type) }}</text>
        <text class="parcel-meta">{{ item.remark || item.createdAt }}</text>
      </view>
      <text class="point-change" :class="{ minus: item.change < 0 }">{{ item.change > 0 ? '+' : '' }}{{ item.change }}</text>
    </view>
  </view>
</template>
