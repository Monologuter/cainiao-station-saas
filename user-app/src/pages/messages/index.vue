<script setup lang="ts">
import { ref } from 'vue';

interface MessageCategory {
  key: string;
  title: string;
  desc: string;
  tone: 'blue' | 'amber' | 'purple';
}

// 后端暂未提供消费者消息列表接口，分类入口先占位，接口就绪后接入。
const categories: MessageCategory[] = [
  { key: 'arrival', title: '到件通知', desc: '包裹到驿站后提醒', tone: 'blue' },
  { key: 'remind', title: '催取提醒', desc: '滞留包裹提醒', tone: 'amber' },
  { key: 'system', title: '系统通知', desc: '公告与活动', tone: 'purple' },
];

// 消息列表数据源（接口接入前为空，展示空态而非假数据）
const messages = ref<unknown[]>([]);
const loading = ref(false);

function notReady() {
  uni.showToast({ title: '消息中心即将上线', icon: 'none' });
}
</script>

<template>
  <view class="mobile-page messages-page">
    <view class="msg-entry-row">
      <button
        v-for="cat in categories"
        :key="cat.key"
        class="mobile-card msg-entry"
        :class="cat.tone"
        type="button"
        :aria-label="cat.title"
        @click="notReady"
      >
        <text class="msg-entry-title">{{ cat.title }}</text>
        <text class="msg-entry-desc">{{ cat.desc }}</text>
      </button>
    </view>

    <view class="msg-sec-head">
      <text class="section-title">全部消息</text>
    </view>

    <view v-if="loading" class="parcel-skeleton">
      <view v-for="n in 3" :key="n" class="mobile-card skeleton-card" aria-hidden="true">
        <view class="skeleton-line lg" />
        <view class="skeleton-line md" />
      </view>
    </view>

    <view v-else-if="messages.length === 0" class="mobile-card msg-empty">
      <text class="msg-empty-glyph" aria-hidden="true">🔔</text>
      <text class="msg-empty-title">暂无新消息</text>
      <text class="msg-empty-desc">到件、催取与系统通知会在这里展示</text>
    </view>

    <view v-else class="msg-list">
      <!-- 接口接入后渲染真实消息 -->
    </view>
  </view>
</template>

<style scoped>
.messages-page {
  padding-bottom: 32px;
}

.msg-entry-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.msg-entry {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 84px;
  padding: 14px 12px;
  border-left: 3px solid var(--primary);
  text-align: left;
}

.msg-entry.blue {
  border-left-color: var(--primary);
}

.msg-entry.amber {
  border-left-color: var(--warn);
}

.msg-entry.purple {
  border-left-color: var(--purple);
}

.msg-entry-title {
  color: var(--text);
  font-size: 14px;
  font-weight: 700;
}

.msg-entry-desc {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.4;
}

.msg-sec-head {
  margin: 4px 2px 12px;
}

.msg-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.msg-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 44px 28px;
  text-align: center;
}

.msg-empty-glyph {
  font-size: 38px;
  line-height: 1;
}

.msg-empty-title {
  color: var(--text);
  font-size: 16px;
  font-weight: 800;
}

.msg-empty-desc {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}
</style>
