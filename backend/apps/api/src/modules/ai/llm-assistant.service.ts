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
    return this.client.continueWithToolResult(turnId, toolName, result);
  }
}
