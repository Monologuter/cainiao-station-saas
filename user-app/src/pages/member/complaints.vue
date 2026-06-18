<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { complaintStatusLabel, myComplaintsApi, submitComplaintApi, type ComplaintItem } from '@/api/review';

const list = ref<ComplaintItem[]>([]);
const form = reactive({
  tenantId: '',
  stationId: '',
  content: '',
});

onMounted(load);

async function load() {
  list.value = (await myComplaintsApi()).list;
}

async function submit() {
  await submitComplaintApi({
    tenantId: form.tenantId,
    stationId: form.stationId,
    type: 'SERVICE',
    content: form.content,
  });
  uni.showToast({ title: '投诉已提交', icon: 'none' });
  await load();
}
</script>

<template>
  <view class="mobile-page">
    <view class="mobile-card form-card">
      <text class="section-title">提交投诉</text>
      <input v-model="form.tenantId" class="mobile-input" placeholder="租户 ID" aria-label="租户 ID" />
      <input v-model="form.stationId" class="mobile-input" placeholder="门店 ID" aria-label="门店 ID" />
      <input v-model="form.content" class="mobile-input" placeholder="投诉内容" aria-label="投诉内容" />
      <button class="primary-btn" type="button" @click="submit">提交投诉</button>
    </view>

    <view v-for="item in list" :key="item.id" class="mobile-card parcel-card">
      <text class="entry-title">{{ complaintStatusLabel(item.status) }}</text>
      <text class="parcel-meta">{{ item.content }}</text>
      <text v-if="item.handleNote" class="parcel-status">处理记录：{{ item.handleNote }}</text>
    </view>
  </view>
</template>
