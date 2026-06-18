import { defineStore } from 'pinia';
import {
  type AssistantEvent,
  type AssistantMessage,
  sendAssistantMessageApi,
} from '@/api/assistant';

type UiMessageRole = 'user' | 'assistant' | 'tool';

export interface UiAssistantMessage {
  id: string;
  role: UiMessageRole;
  content: string;
  degraded?: boolean;
  citations?: unknown[];
  pending?: boolean;
}

export const useAssistantStore = defineStore('assistant', {
  state: () => ({
    tenantId: '',
    conversationId: undefined as string | undefined,
    messages: [] as UiAssistantMessage[],
    sending: false,
    error: '',
  }),
  actions: {
    setTenantId(tenantId: string) {
      this.tenantId = tenantId;
    },
    async sendQuick(message: string) {
      return this.send(message);
    },
    async send(message: string) {
      const content = message.trim();
      if (!content || !this.tenantId || this.sending) {
        return;
      }
      this.error = '';
      this.sending = true;
      this.messages.push({
        id: `user-${Date.now()}`,
        role: 'user',
        content,
      });
      const assistantMessage: UiAssistantMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        pending: true,
        citations: [],
      };
      this.messages.push(assistantMessage);

      try {
        const events = await sendAssistantMessageApi({
          tenantId: this.tenantId,
          message: content,
          conversationId: this.conversationId,
        });
        this.applyEvents(events, assistantMessage);
      } catch (error) {
        assistantMessage.pending = false;
        this.error = error instanceof Error ? error.message : '客服暂时不可用';
      } finally {
        this.sending = false;
      }
    },
    applyHistory(items: AssistantMessage[]) {
      this.messages = items.map((item) => ({
        id: item.id,
        role: item.role === 'USER' ? 'user' : item.role === 'TOOL' ? 'tool' : 'assistant',
        content: item.content,
        degraded: item.degraded,
      }));
    },
    applyEvents(events: AssistantEvent[], assistantMessage: UiAssistantMessage) {
      for (const item of events) {
        if (item.event === 'delta') {
          assistantMessage.content += String(item.data.text ?? '');
        }
        if (item.event === 'citation') {
          assistantMessage.citations = [
            ...(assistantMessage.citations ?? []),
            item.data,
          ];
        }
        if (item.event === 'tool') {
          this.messages.splice(this.messages.length - 1, 0, {
            id: `tool-${Date.now()}-${this.messages.length}`,
            role: 'tool',
            content: this.toolText(item.data),
          });
        }
        if (item.event === 'done') {
          this.conversationId = String(item.data.conversationId ?? this.conversationId ?? '');
          assistantMessage.degraded = Boolean(item.data.degraded);
          assistantMessage.pending = false;
        }
      }
      assistantMessage.pending = false;
    },
    toolText(data: Record<string, unknown>) {
      if (data.name === 'query_my_parcels') {
        return '正在核对您的手机号与包裹记录';
      }
      if (data.name === 'query_logistics') {
        return '正在读取物流轨迹';
      }
      return '正在查询业务数据';
    },
  },
});
