import { Injectable, Optional } from '@nestjs/common';
import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
import { requireAiServiceToken } from '../../core/config/security-env';
import { AssistantAnswer, AssistantContext } from './assistant.types';

const DEFAULT_TIMEOUT_MS = 5000;

const BREAKER_OPTIONS = {
  failureThreshold: 3,
  coolDownMs: 30_000,
  // Give the breaker timeout a little headroom over the fetch abort so the
  // AbortController is the primary timeout path and surfaces as a clear error.
  timeoutMs: DEFAULT_TIMEOUT_MS + 1000,
};

/**
 * Raised when the assistant ai-service is unreachable, times out, or the
 * circuit breaker is open. Recognizable by the upper LlmAssistantService so it
 * can degrade to the FAQ fallback instead of letting the failure bubble into a
 * 500 response.
 */
export class AssistantServiceUnavailableError extends Error {
  readonly code = 'AI_SERVICE_UNAVAILABLE';

  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AssistantServiceUnavailableError';
  }
}

@Injectable()
export class AssistantClient {
  private readonly baseUrl =
    process.env.AI_SERVICE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8000';
  private readonly serviceToken = requireAiServiceToken();

  private readonly breaker: CircuitBreakerService;

  constructor(@Optional() breaker?: CircuitBreakerService) {
    this.breaker = breaker ?? new CircuitBreakerService();
  }

  async ask(question: string, ctx: AssistantContext): Promise<AssistantAnswer> {
    const events = await this.postSse('/assistant/chat', {
      tenantId: ctx.tenantId,
      question,
      conversationId: ctx.conversationId,
      actorType: ctx.actorType,
      channel: ctx.channel,
    });
    return this.toAnswer(events);
  }

  async continueWithToolResult(
    turnId: string,
    toolName: string,
    result: Record<string, unknown>,
  ): Promise<AssistantAnswer> {
    const events = await this.postSse(`/assistant/chat/${turnId}/tool_result`, {
      toolName,
      result,
    });
    return this.toAnswer(events);
  }

  private async postSse(path: string, payload: Record<string, unknown>) {
    try {
      return await this.breaker.execute(
        'assistant.ai-service',
        BREAKER_OPTIONS,
        () => this.callAiService(path, payload),
      );
    } catch (error) {
      if (error instanceof AssistantServiceUnavailableError) {
        throw error;
      }
      // Circuit open, breaker timeout, or any other transport failure.
      throw new AssistantServiceUnavailableError(
        `assistant ai-service unavailable: ${path}`,
        error,
      );
    }
  }

  private async callAiService(path: string, payload: Record<string, unknown>) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.resolveTimeoutMs(),
    );
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Token': this.serviceToken,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      } as any);
      if (!response.ok) {
        throw new AssistantServiceUnavailableError(
          `assistant service error: ${response.status}`,
        );
      }
      return this.parseSse(await response.text());
    } catch (error) {
      if (error instanceof AssistantServiceUnavailableError) {
        throw error;
      }
      // Aborted (timeout) or connection refused / network error.
      throw new AssistantServiceUnavailableError(
        `assistant ai-service request failed: ${path}`,
        error,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolveTimeoutMs(): number {
    return Number(process.env.AI_ASSISTANT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  }

  private parseSse(text: string) {
    return text
      .split(/\n\n+/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const lines = chunk.split('\n');
        const event =
          lines
            .find((line) => line.startsWith('event: '))
            ?.slice(7)
            .trim() ?? 'message';
        const data = lines
          .filter((line) => line.startsWith('data: '))
          .map((line) => line.slice(6))
          .join('\n');
        return { event, data: data ? JSON.parse(data) : {} };
      });
  }

  private toAnswer(
    events: Array<{ event: string; data: any }>,
  ): AssistantAnswer {
    const text: string[] = [];
    const citations: any[] = [];
    const toolCalls: Array<Record<string, unknown>> = [];
    let degraded = false;
    let mode: 'MOCK' | 'REAL' = 'MOCK';

    for (const item of events) {
      if (item.event === 'delta') {
        text.push(String(item.data.text ?? ''));
      }
      if (item.event === 'citation') {
        citations.push(...(Array.isArray(item.data) ? item.data : [item.data]));
      }
      if (item.event === 'tool_call') {
        toolCalls.push({
          turnId: item.data.turnId,
          name: item.data.toolName ?? item.data.name,
          args: item.data.args ?? {},
        });
      }
      if (item.event === 'done') {
        degraded = Boolean(item.data.degraded);
        mode =
          item.data.mode === 'real' || item.data.mode === 'REAL'
            ? 'REAL'
            : 'MOCK';
      }
    }

    return {
      text: text.join(''),
      citations,
      toolCalls,
      degraded,
      mode,
    };
  }
}
