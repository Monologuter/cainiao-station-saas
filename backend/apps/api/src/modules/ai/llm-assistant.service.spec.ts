import { AssistantClient } from './assistant.client';
import { AssistantAnswer, AssistantContext } from './assistant.types';
import { FaqAssistantService } from './faq-assistant.service';
import { LlmAssistantService } from './llm-assistant.service';

describe('LlmAssistantService', () => {
  const ctx: AssistantContext = {
    tenantId: 'tenant-1',
    actorType: 'CONSUMER',
    channel: 'USER_APP',
    consumerId: 'consumer-1',
  };

  const faqAnswer: AssistantAnswer = {
    text: 'FAQ 兜底回答',
    citations: [],
    toolCalls: [],
    degraded: true,
    mode: 'MOCK',
  };

  function build(clientOverrides: Partial<AssistantClient>) {
    const client = {
      ask: jest.fn(),
      continueWithToolResult: jest.fn(),
      ...clientOverrides,
    } as unknown as AssistantClient;
    const fallback = {
      ask: jest.fn(async () => faqAnswer),
    } as unknown as FaqAssistantService;
    return {
      service: new LlmAssistantService(client, fallback),
      client,
      fallback,
    };
  }

  describe('ask (first round)', () => {
    it('returns the live answer when ai-service responds', async () => {
      const live: AssistantAnswer = {
        text: '在线回答',
        citations: [],
        toolCalls: [],
        degraded: false,
        mode: 'REAL',
      };
      const { service, fallback } = build({
        ask: jest.fn(async () => live),
      });

      await expect(service.ask('在吗？', ctx)).resolves.toBe(live);
      expect(fallback.ask).not.toHaveBeenCalled();
    });

    it('degrades to FAQ (not a 500) when ai-service throws', async () => {
      const { service, fallback } = build({
        ask: jest.fn(async () => {
          throw new Error('AI_SERVICE_UNAVAILABLE');
        }),
      });

      const answer = await service.ask('在吗？', ctx);

      expect(answer).toBe(faqAnswer);
      expect(fallback.ask).toHaveBeenCalledWith('在吗？', ctx);
    });
  });

  describe('continueWithToolResult (second round)', () => {
    it('returns the live continuation when ai-service responds', async () => {
      const continued: AssistantAnswer = {
        text: '工具回填后的回答',
        citations: [],
        toolCalls: [],
        degraded: false,
        mode: 'REAL',
      };
      const { service } = build({
        continueWithToolResult: jest.fn(async () => continued),
      });

      await expect(
        service.continueWithToolResult('turn-1', 'query_my_parcels', {
          items: [],
        }),
      ).resolves.toBe(continued);
    });

    it('degrades instead of bubbling a 500 when ai-service fails on the tool round', async () => {
      const { service } = build({
        continueWithToolResult: jest.fn(async () => {
          throw new Error('AI_SERVICE_UNAVAILABLE');
        }),
      });

      const answer = await service.continueWithToolResult(
        'turn-1',
        'query_my_parcels',
        { items: [] },
      );

      // No throw -> caller (AssistantService) won't surface a 500. The already
      // fetched tool result stays intact; the turn is flagged degraded.
      expect(answer).toMatchObject({
        text: '',
        degraded: true,
        mode: 'MOCK',
        citations: [],
        toolCalls: [],
      });
    });
  });
});
