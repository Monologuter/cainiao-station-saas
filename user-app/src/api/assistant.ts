import { authHeader, getPickToken, request } from '@/utils/request';

export type AssistantEventName = 'delta' | 'tool' | 'citation' | 'done' | 'error';

export interface AssistantEvent<T = Record<string, unknown>> {
  event: AssistantEventName;
  data: T;
}

export interface SendAssistantMessageInput {
  tenantId: string;
  message: string;
  conversationId?: string;
}

export interface AssistantConversation {
  id: string;
  tenantId: string;
  title: string;
  mode: 'MOCK' | 'REAL';
  status: string;
  lastActiveAt: string;
  createdAt: string;
}

export interface AssistantMessage {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'TOOL';
  content: string;
  citations?: unknown;
  degraded: boolean;
  seq: number;
  createdAt: string;
}

export function parseAssistantSse(text: string): AssistantEvent[] {
  return text
    .split(/\n\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const event =
        chunk
          .split('\n')
          .find((line) => line.startsWith('event: '))
          ?.slice(7)
          .trim() ?? 'message';
      const data = chunk
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n');
      return {
        event: event as AssistantEventName,
        data: data ? JSON.parse(data) : {},
      };
    });
}

export function sendAssistantMessageApi(input: SendAssistantMessageInput) {
  return new Promise<AssistantEvent[]>((resolve, reject) => {
    uni.request({
      url: '/api/assistant/chat',
      method: 'POST',
      header: {
        Accept: 'text/event-stream',
        ...authHeader(getPickToken()),
      },
      data: input,
      success(res) {
        resolve(parseAssistantSse(String(res.data ?? '')));
      },
      fail: reject,
    });
  });
}

export function listAssistantConversationsApi(tenantId: string) {
  return request<AssistantConversation[]>({
    url: `/api/assistant/conversations?tenantId=${encodeURIComponent(tenantId)}`,
    method: 'GET',
  });
}

export function listAssistantMessagesApi(tenantId: string, conversationId: string) {
  return request<AssistantMessage[]>({
    url: `/api/assistant/conversations/${conversationId}/messages?tenantId=${encodeURIComponent(tenantId)}`,
    method: 'GET',
  });
}
