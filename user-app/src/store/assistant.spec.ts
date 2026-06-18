import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendAssistantMessageApi } from '@/api/assistant';
import { useAssistantStore } from './assistant';

vi.mock('@/api/assistant', () => ({
  sendAssistantMessageApi: vi.fn(),
}));

describe('assistant store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(sendAssistantMessageApi).mockReset();
  });

  it('sends quick questions through chat api and keeps the conversation id', async () => {
    vi.mocked(sendAssistantMessageApi).mockResolvedValue([
      { event: 'delta', data: { text: '已为您查询。' } },
      { event: 'done', data: { conversationId: 'conv-1', degraded: false } },
    ]);
    const store = useAssistantStore();
    store.setTenantId('tenant-1');

    await store.sendQuick('我的包裹到了吗？');

    expect(sendAssistantMessageApi).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      message: '我的包裹到了吗？',
      conversationId: undefined,
    });
    expect(store.conversationId).toBe('conv-1');
    expect(store.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: '已为您查询。',
      degraded: false,
    });
  });
});
