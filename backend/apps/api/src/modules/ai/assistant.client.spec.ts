import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
import {
  AssistantClient,
  AssistantServiceUnavailableError,
} from './assistant.client';

describe('AssistantClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    delete process.env.AI_SERVICE_URL;
    delete process.env.AI_SERVICE_TOKEN;
    delete process.env.AI_ASSISTANT_TIMEOUT_MS;
  });

  const consumerCtx = {
    tenantId: 'tenant-1',
    actorType: 'CONSUMER' as const,
    channel: 'USER_APP' as const,
    consumerId: 'consumer-1',
    verifiedPhone: '13800001234',
  };

  it('parses ai-service tool calls and continuation events', async () => {
    process.env.AI_SERVICE_URL = 'http://ai.local';
    process.env.AI_SERVICE_TOKEN = 'test-token';
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

    const answer = await client.ask('我的包裹到了吗？', consumerCtx);
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

  it('aborts the request with AbortController when ai-service hangs past the timeout', async () => {
    process.env.AI_ASSISTANT_TIMEOUT_MS = '20';
    process.env.AI_SERVICE_TOKEN = 'test-token';
    let capturedSignal: AbortSignal | undefined;
    global.fetch = jest.fn((_url: string, init: any) => {
      capturedSignal = init?.signal;
      // ai-service hangs: only settle when the AbortController fires.
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    }) as any;
    const client = new AssistantClient(new CircuitBreakerService());

    const error = await client.ask('在吗？', consumerCtx).catch((e) => e);

    expect(error).toBeInstanceOf(AssistantServiceUnavailableError);
    expect((error as AssistantServiceUnavailableError).code).toBe(
      'AI_SERVICE_UNAVAILABLE',
    );
    expect(capturedSignal?.aborted).toBe(true);
  });

  it('wraps connection failures (refused/network) as AssistantServiceUnavailableError', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:8000');
    }) as any;
    process.env.AI_SERVICE_TOKEN = 'test-token';
    const client = new AssistantClient(new CircuitBreakerService());

    const error = await client.ask('在吗？', consumerCtx).catch((e) => e);

    expect(error).toBeInstanceOf(AssistantServiceUnavailableError);
    expect((error as AssistantServiceUnavailableError).code).toBe(
      'AI_SERVICE_UNAVAILABLE',
    );
  });

  it('also wraps tool-result-round (continueWithToolResult) failures', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as any;
    process.env.AI_SERVICE_TOKEN = 'test-token';
    const client = new AssistantClient(new CircuitBreakerService());

    const error = await client
      .continueWithToolResult('turn-1', 'query_my_parcels', { items: [] })
      .catch((e) => e);

    expect(error).toBeInstanceOf(AssistantServiceUnavailableError);
  });

  it('opens the circuit after repeated failures and fails fast without calling fetch', async () => {
    const breaker = new CircuitBreakerService();
    const fetchMock = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as any;
    global.fetch = fetchMock;
    process.env.AI_SERVICE_TOKEN = 'test-token';
    const client = new AssistantClient(breaker);

    // failureThreshold is 3 -> after 3 failures the breaker opens.
    for (let i = 0; i < 3; i += 1) {
      await client.ask('在吗？', consumerCtx).catch(() => undefined);
    }
    expect(breaker.snapshot('assistant.ai-service')?.state).toBe('OPEN');

    const callsBeforeOpenAttempt = fetchMock.mock.calls.length;
    const error = await client.ask('在吗？', consumerCtx).catch((e) => e);

    // Circuit is open: fast-fail, fetch must NOT be invoked again.
    expect(error).toBeInstanceOf(AssistantServiceUnavailableError);
    expect(fetchMock.mock.calls.length).toBe(callsBeforeOpenAttempt);
  });

  function response(body: string) {
    return {
      ok: true,
      status: 200,
      text: async () => body,
    };
  }
});
