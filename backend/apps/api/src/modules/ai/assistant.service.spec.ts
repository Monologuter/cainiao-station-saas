import { TenantContext } from '../../core/tenant-context/tenant-context';
import { FaqAssistantService } from './faq-assistant.service';
import { LlmAssistantService } from './llm-assistant.service';

describe('Assistant services', () => {
  const tx = {
    faqEntry: {
      findMany: jest.fn(),
    },
  };
  const tenantPrisma = {
    withTenant: jest.fn((fn) => fn(tx)),
  };
  const ctx = {
    tenantId: 'tenant-1',
    actorType: 'CONSUMER' as const,
    consumerId: 'consumer-1',
    channel: 'USER_APP' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('answers from FAQ with citations in degraded mode', async () => {
    tx.faqEntry.findMany.mockResolvedValue([
      {
        id: 'faq-1',
        category: 'SHIPPING',
        question: '怎么在线寄件？',
        answer: '进入寄件页面填写信息并支付。',
        keywords: ['寄件', '下单'],
        priority: 10,
        source: 'seed:p4-2',
      },
    ]);
    const service = new FaqAssistantService(tenantPrisma as any);

    const answer = await runAsTenant(() => service.ask('怎么寄件？', ctx));

    expect(answer).toMatchObject({
      text: '进入寄件页面填写信息并支付。',
      degraded: true,
      mode: 'MOCK',
      citations: [
        {
          id: 'faq-1',
          category: 'SHIPPING',
          question: '怎么在线寄件？',
        },
      ],
    });
  });

  it('returns fallback guidance when FAQ misses', async () => {
    tx.faqEntry.findMany.mockResolvedValue([]);
    const service = new FaqAssistantService(tenantPrisma as any);

    const answer = await runAsTenant(() => service.ask('我要修改地址', ctx));

    expect(answer.degraded).toBe(true);
    expect(answer.text).toContain('我的包裹到了吗');
    expect(answer.citations).toEqual([]);
  });

  it('falls back to FAQ when LLM assistant fails', async () => {
    const client = {
      ask: jest.fn().mockRejectedValue(new Error('llm timeout')),
    };
    const faq = {
      ask: jest.fn().mockResolvedValue({
        text: '基础 FAQ 答案',
        citations: [],
        toolCalls: [],
        degraded: true,
        mode: 'MOCK',
      }),
    };
    const service = new LlmAssistantService(client as any, faq as any);

    const answer = await service.ask('我的包裹到了吗？', ctx);

    expect(client.ask).toHaveBeenCalledWith('我的包裹到了吗？', ctx);
    expect(faq.ask).toHaveBeenCalledWith('我的包裹到了吗？', ctx);
    expect(answer).toMatchObject({ text: '基础 FAQ 答案', degraded: true });
  });

  function runAsTenant<T>(fn: () => T) {
    return TenantContext.run(
      {
        userId: 'user-1',
        tenantId: 'tenant-1',
        roles: [],
        isPlatform: false,
      },
      fn,
    );
  }
});
