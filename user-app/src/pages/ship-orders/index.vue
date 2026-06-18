<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { shippingStatusLabel, shippingStatusTag, type ShipOrderStatus } from '@/api/shipping';
import { useShippingStore } from '@/stores/shipping';

const shipping = useShippingStore();
const active = ref<ShipOrderStatus | ''>('');
const tabs: Array<{ label: string; status: ShipOrderStatus | '' }> = [
  { label: '全部', status: '' },
  { label: '待支付', status: 'CREATED' },
  { label: '运输中', status: 'IN_TRANSIT' },
];

onMounted(() => refresh(active.value));

function refresh(status: ShipOrderStatus | '') {
  shipping.load({ status, page: 1, size: 20 }).catch(() => undefined);
}

function switchTab(status: ShipOrderStatus | '') {
  active.value = status;
  refresh(status);
}

function openTracking(id: string) {
  uni.navigateTo({ url: `/pages/tracking/index?id=${id}` });
}

function goShip() {
  uni.navigateTo({ url: '/pages/ship/index' });
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

    <button class="primary-btn home-action" type="button" @click="goShip">新建寄件</button>

    <view v-if="shipping.loading && shipping.list.length === 0" class="parcel-skeleton">
      <view v-for="n in 3" :key="n" class="mobile-card skeleton-card" aria-hidden="true">
        <view class="skeleton-line lg" />
        <view class="skeleton-line md" />
        <view class="skeleton-line sm" />
      </view>
    </view>
    <view v-else-if="shipping.error" class="mobile-card empty-mobile" role="alert">
      {{ shipping.error }}，<text class="retry-link" @click="refresh(active)">点击重试</text>
    </view>
    <view v-else-if="shipping.list.length === 0" class="mobile-card empty-mobile">暂无寄件单</view>
    <view
      v-else
      v-for="item in shipping.list"
      :key="item.id"
      class="mobile-card parcel-card ship-order-card"
      @click="openTracking(item.id)"
    >
      <view class="ship-order-top">
        <text class="parcel-code">{{ item.orderNo }}</text>
        <text class="mini-tag" :class="shippingStatusTag(item.status)">{{ shippingStatusLabel(item.status) }}</text>
      </view>
      <text class="parcel-meta">{{ item.courierName }} · {{ item.receiverJson.city }} {{ item.receiverJson.district }}</text>
      <text class="parcel-status">¥{{ item.quoteAmount.toFixed(2) }} · {{ item.waybillNo ?? '待生成运单' }}</text>
    </view>
  </view>
</template>
