<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { myReviewsApi, reviewRatingText, submitReviewApi, type ReviewItem } from '@/api/review';

const list = ref<ReviewItem[]>([]);
const form = reactive({
  tenantId: '',
  stationId: '',
  refId: '',
  rating: 5,
  content: '',
});

onMounted(load);

async function load() {
  list.value = (await myReviewsApi()).list;
}

async function submit() {
  await submitReviewApi({
    tenantId: form.tenantId,
    stationId: form.stationId,
    targetType: 'PICKUP',
    refType: 'parcel',
    refId: form.refId,
    rating: Number(form.rating),
    content: form.content,
  });
  uni.showToast({ title: '评价已提交', icon: 'none' });
  await load();
}
</script>

<template>
  <view class="mobile-page">
    <view class="mobile-card form-card">
      <text class="section-title">提交评价</text>
      <input v-model="form.tenantId" class="mobile-input" placeholder="租户 ID" />
      <input v-model="form.stationId" class="mobile-input" placeholder="门店 ID" />
      <input v-model="form.refId" class="mobile-input" placeholder="包裹或寄件单 ID" />
      <input v-model="form.rating" class="mobile-input" type="number" placeholder="评分 1-5" />
      <input v-model="form.content" class="mobile-input" placeholder="评价内容" />
      <button class="primary-btn" type="button" @click="submit">提交评价</button>
    </view>

    <view v-for="item in list" :key="item.id" class="mobile-card parcel-card">
      <text class="entry-title">{{ reviewRatingText(item.rating) }}</text>
      <text class="parcel-meta">{{ item.content || item.refId }}</text>
      <text v-if="item.replyContent" class="parcel-status">店长回复：{{ item.replyContent }}</text>
    </view>
  </view>
</template>
