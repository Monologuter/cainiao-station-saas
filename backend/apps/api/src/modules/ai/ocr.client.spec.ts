import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
import { OcrClient } from './ocr.client';

describe('OcrClient', () => {
  const breaker = new CircuitBreakerService();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls ai-service with service token and request id', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        provider: 'mock',
        fields: {
          waybillNo: { value: 'SF123', confidence: 0.9 },
        },
        overallConfidence: 0.9,
        latencyMs: 8,
        warnings: [],
      }),
    } as any);
    const client = new OcrClient(breaker, {
      baseUrl: 'http://ai-service:8000',
      serviceToken: 'svc-token',
      timeoutMs: 1000,
    });

    const result = await client.recognizeWaybill({
      image: Buffer.from('img'),
      filename: 'label.jpg',
      contentType: 'image/jpeg',
      requestId: 'trace-1',
    });

    expect(result.provider).toBe('mock');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://ai-service:8000/ocr/waybill',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Service-Token': 'svc-token',
          'X-Request-Id': 'trace-1',
        }),
      }),
    );
  });

  it('returns fallback failed result on ai-service 5xx', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'down',
    } as any);
    const client = new OcrClient(breaker, {
      baseUrl: 'http://ai-service:8000',
      serviceToken: 'svc-token',
      timeoutMs: 1000,
    });

    await expect(
      client.recognizeWaybill({
        image: Buffer.from('img'),
        filename: 'label.jpg',
        contentType: 'image/jpeg',
        requestId: 'trace-2',
      }),
    ).resolves.toMatchObject({
      provider: 'fallback',
      errorCode: 'AI_SERVICE_UNAVAILABLE',
      overallConfidence: 0,
    });
  });
});
