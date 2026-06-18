<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAssistantStore } from '@/store/assistant';
import { useParcelStore } from '@/store/parcel';

const assistant = useAssistantStore();
const parcels = useParcelStore();
const draft = ref('');
const quickQuestions = ['我的包裹到了吗？', '取件码在哪里？', '怎么在线寄件？'];
const tenantReady = computed(() => Boolean(assistant.tenantId));

onMounted(async () => {
  if (!parcels.list.length) {
    await parcels.load();
  }
  const tenantId = parcels.list[0]?.tenantId;
  if (tenantId) {
    assistant.setTenantId(tenantId);
  }
});

function send() {
  const text = draft.value;
  draft.value = '';
  assistant.send(text);
}

function sendQuick(text: string) {
  assistant.sendQuick(text);
}
</script>

<template>
  <view class="assistant-page">
    <view class="assistant-top">
      <text class="eyebrow">在线客服</text>
      <text class="assistant-title">驿站助手</text>
      <text class="desc">取件、寄件、物流和会员问题都可以问我。</text>
    </view>

    <view class="quick-row">
      <button
        v-for="item in quickQuestions"
        :key="item"
        class="quick-chip"
        type="button"
        :disabled="assistant.sending || !tenantReady"
        @click="sendQuick(item)"
      >
        {{ item }}
      </button>
    </view>

    <scroll-view class="chat-list" scroll-y>
      <view
        v-for="message in assistant.messages"
        :key="message.id"
        class="message-row"
        :class="message.role"
      >
        <view class="bubble">
          <text class="bubble-text">{{ message.content || '正在回复...' }}</text>
          <text v-if="message.degraded" class="mode-badge">基础应答</text>
          <view v-if="message.citations?.length" class="citation-list">
            <text
              v-for="(citation, index) in message.citations"
              :key="index"
              class="citation"
            >
              {{ (citation as any).question ?? '参考知识' }}
            </text>
          </view>
        </view>
      </view>
      <view v-if="!assistant.messages.length" class="empty-card mobile-card">
        <text class="entry-title">先问一句</text>
        <text class="entry-desc">比如“我的包裹到了吗？”</text>
      </view>
    </scroll-view>

    <view v-if="assistant.error" class="error-line">{{ assistant.error }}</view>
    <view v-if="!tenantReady" class="error-line">请先完成登录并拥有一条驿站记录</view>

    <view class="composer">
      <input
        v-model="draft"
        class="composer-input"
        placeholder="输入问题"
        confirm-type="send"
        :disabled="assistant.sending || !tenantReady"
        @confirm="send"
      />
      <button
        class="send-btn"
        type="button"
        :disabled="assistant.sending || !tenantReady"
        @click="send"
      >
        发送
      </button>
    </view>
  </view>
</template>
