<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { statusLabel, type ConsumerParcelStatus } from '@/api/parcel';
import { useParcelStore } from '@/stores/parcel';

const parcel = useParcelStore();
const active = ref<ConsumerParcelStatus | ''>('STORED');
const tabs: Array<{ label: string; status: ConsumerParcelStatus | '' }> = [
  { label: '待取', status: 'STORED' },
  { label: '已取', status: 'PICKED_UP' },
  { label: '全部', status: '' },
];
const emptyText = computed(() => (active.value === 'STORED' ? '暂无待取包裹' : '暂无包裹'));

onMounted(() => refresh(active.value));

function refresh(status: ConsumerParcelStatus | '') {
  // 错误已在 store 内统一 toast，这里吞掉避免未处理拒绝
  parcel.load(status).catch(() => undefined);
}

function switchTab(status: ConsumerParcelStatus | '') {
  active.value = status;
  refresh(status);
}

function openCode(id: string) {
  uni.navigateTo({ url: `/pages/pickup-code/index?id=${id}` });
}
</script>

<template>
  <view class="mobile-page">
    <view class="tabs-mobile">
      <button
        v-for="tab in tabs"
        :key="tab.label"
        class="tab-mobile"
        :class="{ on: active === tab.status }"
        type="button"
        @click="switchTab(tab.status)"
      >
        {{ tab.label }}
      </button>
    </view>

    <view v-if="parcel.loading && parcel.list.length === 0" class="parcel-skeleton">
      <view v-for="n in 3" :key="n" class="mobile-card skeleton-card" aria-hidden="true">
        <view class="skeleton-line lg" />
        <view class="skeleton-line md" />
        <view class="skeleton-line sm" />
      </view>
    </view>
    <view
      v-else-if="parcel.error"
      class="mobile-card empty-mobile"
      role="alert"
    >
      {{ parcel.error }}，<text class="retry-link" @click="refresh(active)">点击重试</text>
    </view>
    <view v-else-if="parcel.list.length === 0" class="mobile-card empty-mobile">{{ emptyText }}</view>
    <view v-else v-for="item in parcel.list" :key="item.id" class="mobile-card parcel-card" @click="openCode(item.id)">
      <text class="parcel-code">{{ item.pickupCode ?? item.waybillNo }}</text>
      <text class="parcel-meta">{{ item.station?.name ?? '驿站' }} · {{ item.slot?.code ?? '未分配' }}</text>
      <text class="parcel-status">{{ statusLabel(item.status) }}</text>
    </view>
  </view>
</template>
