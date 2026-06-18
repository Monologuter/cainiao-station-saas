<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { formatPickupCode, statusLabel } from '@/api/parcel';
import { useParcelStore } from '@/stores/parcel';

const parcel = useParcelStore();
const code = computed(() => formatPickupCode(parcel.current?.pickupCode));

onMounted(() => {
  const pages = getCurrentPages();
  const route = pages[pages.length - 1] as unknown as { options?: { id?: string } };
  const id = route.options?.id;
  if (id) {
    parcel.loadDetail(id);
  }
});
</script>

<template>
  <view class="mobile-page">
    <view class="mobile-card pickup-code-card">
      <text class="eyebrow">{{ parcel.current ? statusLabel(parcel.current.status) : '取件码' }}</text>
      <text class="big-code">{{ code }}</text>
      <text class="desc">
        {{ parcel.current?.station?.name ?? '驿站' }} · {{ parcel.current?.slot?.code ?? '库位待同步' }}
      </text>
    </view>
    <view class="mobile-card barcode-card">
      <view class="fake-barcode"></view>
      <text class="desc">请向店员出示此取件码核销。</text>
    </view>
  </view>
</template>
