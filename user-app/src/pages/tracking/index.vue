<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { shippingStatusLabel, shippingStatusTag } from '@/api/shipping';
import { useShippingStore } from '@/stores/shipping';

const shipping = useShippingStore();
const order = computed(() => shipping.current);

onMounted(() => {
  const pages = getCurrentPages();
  const route = pages[pages.length - 1] as unknown as { options?: { id?: string } };
  const id = route.options?.id;
  if (id) {
    shipping.loadDetail(id);
  }
});

function formatTime(value?: string | null) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function backOrders() {
  uni.redirectTo({ url: '/pages/ship-orders/index' });
}
</script>

<template>
  <view class="mobile-page">
    <view v-if="order" class="mobile-card tracking-head">
      <text class="eyebrow">{{ order.courierName }}</text>
      <text class="title">{{ order.waybillNo ?? order.orderNo }}</text>
      <text class="mini-tag" :class="shippingStatusTag(order.status)">{{ shippingStatusLabel(order.status) }}</text>
      <text class="desc">
        收件人 {{ order.receiverJson.name }} · {{ order.receiverJson.city }} {{ order.receiverJson.district }}
      </text>
    </view>

    <view class="mobile-card track-card">
      <view class="section-title">物流轨迹</view>
      <view v-if="shipping.tracks.length === 0" class="empty-mobile">揽收后显示物流节点</view>
      <view v-for="(item, index) in shipping.tracks" :key="item.id" class="track-node" :class="{ current: index === 0 }">
        <view class="track-dot"></view>
        <view class="track-body">
          <text class="track-desc">{{ item.description }}</text>
          <text class="track-meta">{{ item.location }} · {{ formatTime(item.happenedAt) }}</text>
        </view>
      </view>
    </view>

    <button class="primary-btn home-action" type="button" @click="backOrders">返回我的寄件</button>
  </view>
</template>
