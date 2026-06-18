import { AssistantClient } from './assistant.client';

describe('AssistantClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.AI_SERVICE_URL;
    delete process.env.SERVICE_TOKEN;
  });

  it('parses ai-service tool calls and continuation events', async () => {
    process.env.AI_SERVICE_URL = 'http://ai.local';
    process.env.SERVICE_TOKEN = 'test-token';
    const fetchMock = jest.fn(async (url: string) => {
      if (url.endsWith('/assistant/chat')) {
        return response(
          [
            'event: tool_call',
            'data: {"turnId":"turn-1","toolName":"query_my_parcels","args":{"status":"STORED"}}',
            '',
          ].join('\n'),
        );
      }
      return response(
        [
          'event: delta',
          'data: {"text":"您有 1 件包裹待取，取件码 A123。"}',
          '',
          'event: done',
          'data: {"degraded":true,"mode":"mock"}',
          '',
        ].join('\n'),
      );
    });
    global.fetch = fetchMock as any;
    const client = new AssistantClient();

    const answer = await client.ask('我的包裹到了吗？', {
      tenantId: 'tenant-1',
      actorType: 'CONSUMER',
      channel: 'USER_APP',
      consumerId: 'consumer-1',
      verifiedPhone: '13800001234',
    });
    const continued = await client.continueWithToolResult(
      'turn-1',
      'query_my_parcels',
      { items: [{ pickupCode: 'A123' }] },
    );

    expect(answer.toolCalls).toEqual([
      {
        turnId: 'turn-1',
        name: 'query_my_parcels',
        args: { status: 'STORED' },
      },
    ]);
    expect(continued).toMatchObject({
      text: '您有 1 件包裹待取，取件码 A123。',
      degraded: true,
      mode: 'MOCK',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://ai.local/assistant/chat',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Service-Token': 'test-token' }),
      }),
    );
  });

  function response(body: string) {
    return {
      ok: true,
      status: 200,
      text: async () => body,
    };
  }
});
