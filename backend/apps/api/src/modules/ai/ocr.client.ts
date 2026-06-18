import { Injectable, Optional } from '@nestjs/common';
import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
import { requireAiServiceToken } from '../../core/config/security-env';
import { OcrServiceResponse } from './ocr-result.mapper';

export interface OcrClientOptions {
  baseUrl: string;
  serviceToken: string;
  timeoutMs: number;
}

export interface RecognizeWaybillInput {
  image: Buffer;
  filename: string;
  contentType: string;
  requestId: string;
}

const BREAKER_OPTIONS = {
  failureThreshold: 3,
  coolDownMs: 30_000,
  timeoutMs: 5000,
};

@Injectable()
export class OcrClient {
  constructor(
    private readonly breaker: CircuitBreakerService,
    @Optional() private readonly options?: OcrClientOptions,
  ) {}

  async recognizeWaybill(
    input: RecognizeWaybillInput,
  ): Promise<OcrServiceResponse> {
    try {
      return await this.breaker.execute('ocr.ai-service', BREAKER_OPTIONS, () =>
        this.callAiService(input),
      );
    } catch {
      return this.fallback();
    }
  }

  private async callAiService(
    input: RecognizeWaybillInput,
  ): Promise<OcrServiceResponse> {
    const options = this.resolveOptions();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const form = new (globalThis as any).FormData();
      form.append(
        'image',
        new (globalThis as any).Blob([input.image], {
          type: input.contentType,
        }),
        input.filename,
      );

      const response = await fetch(`${options.baseUrl}/ocr/waybill`, {
        method: 'POST',
        headers: {
          'X-Service-Token': options.serviceToken,
          'X-Request-Id': input.requestId,
        },
        body: form,
        signal: controller.signal,
      } as any);
      if (!response.ok) {
        throw new Error(
          `ai-service ${response.status}: ${await response.text()}`,
        );
      }
      return (await response.json()) as OcrServiceResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  private fallback(): OcrServiceResponse {
    return {
      provider: 'fallback',
      fields: {},
      overallConfidence: 0,
      latencyMs: 0,
      warnings: ['ai_service_unavailable'],
      errorCode: 'AI_SERVICE_UNAVAILABLE',
    };
  }

  private resolveOptions(): OcrClientOptions {
    return {
      baseUrl:
        this.options?.baseUrl ??
        process.env.AI_SERVICE_URL ??
        'http://localhost:8000',
      serviceToken:
        this.options?.serviceToken ?? requireAiServiceToken(),
      timeoutMs:
        this.options?.timeoutMs ?? Number(process.env.OCR_TIMEOUT_MS ?? 5000),
    };
  }
}
