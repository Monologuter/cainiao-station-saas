<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { formatPickupCode } from '@/api/parcel';
import { useParcelStore } from '@/stores/parcel';

const parcel = useParcelStore();
const first = computed(() => parcel.firstStored);

onMounted(() => parcel.load('STORED'));

function goParcels() {
  uni.navigateTo({ url: '/pages/parcels/index' });
}

function goCode() {
  if (first.value) {
    uni.navigateTo({ url: `/pages/pickup-code/index?id=${first.value.id}` });
  }
}
</script>

<template>
  <view class="mobile-page">
    <view class="mobile-card hero-card" @click="goCode">
      <text class="eyebrow">我的包裹</text>
      <text class="title">{{ first ? formatPickupCode(first.pickupCode) : '暂无待取包裹' }}</text>
      <text class="desc">
        {{ first ? `${first.station?.name ?? '驿站'} · ${first.slot?.code ?? '未分配'}` : '有包裹入库后会展示取件码。' }}
      </text>
    </view>
    <view class="home-actions">
      <button class="primary-btn" type="button" @click="goParcels">查看全部包裹</button>
      <button class="mini-btn" type="button" @click="uni.navigateTo({ url: '/pages/ship/index' })">在线寄件</button>
      <button class="mini-btn ghost" type="button" @click="uni.navigateTo({ url: '/pages/ship-orders/index' })">我的寄件</button>
      <button class="mini-btn ghost" type="button" @click="uni.navigateTo({ url: '/pages/assistant/index' })">在线客服</button>
      <button class="mini-btn ghost" type="button" @click="uni.navigateTo({ url: '/pages/member/index' })">会员中心</button>
    </view>
    <view v-for="item in parcel.list" :key="item.id" class="mobile-card parcel-card">
      <text class="parcel-code">{{ item.pickupCode }}</text>
      <text class="parcel-meta">{{ item.waybillNo }} · 尾号 {{ item.receiverPhoneTail }}</text>
    </view>
  </view>
</template>
