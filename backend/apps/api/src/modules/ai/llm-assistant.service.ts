import { Injectable } from '@nestjs/common';
import { AssistantClient } from './assistant.client';
import { AssistantAnswer, AssistantContext } from './assistant.types';
import { FaqAssistantService } from './faq-assistant.service';

@Injectable()
export class LlmAssistantService {
  constructor(
    private readonly client: AssistantClient,
    private readonly fallback: FaqAssistantService,
  ) {}

  async ask(question: string, ctx: AssistantContext): Promise<AssistantAnswer> {
    try {
      return await this.client.ask(question, ctx);
    } catch {
      return this.fallback.ask(question, ctx);
    }
  }

  async continueWithToolResult(
    turnId: string,
    toolName: string,
    result: Record<string, unknown>,
  ): Promise<AssistantAnswer> {
    try {
      return await this.client.continueWithToolResult(turnId, toolName, result);
    } catch {
      // ai-service failed/timed out/circuit-open during the second tool-result
      // round. Degrade instead of letting it bubble into a 500: the tool data
      // has already been fetched and emitted by the caller, so we return an
      // empty degraded answer marked degraded to avoid losing the turn.
      return this.degraded();
    }
  }

  private degraded(): AssistantAnswer {
    return {
      text: '',
      citations: [],
      toolCalls: [],
      degraded: true,
      mode: 'MOCK',
    };
  }
}
