import { Injectable } from '@nestjs/common';
import { AssistantAnswer, AssistantContext } from './assistant.types';

@Injectable()
export class AssistantClient {
  private readonly baseUrl =
    process.env.AI_SERVICE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8000';
  private readonly serviceToken =
    process.env.AI_SERVICE_TOKEN ??
    process.env.SERVICE_TOKEN ??
    'dev-service-token';

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
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': this.serviceToken,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`assistant service error: ${response.status}`);
    }
    return this.parseSse(await response.text());
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
