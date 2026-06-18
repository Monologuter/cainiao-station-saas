import { Injectable } from '@nestjs/common';
import { ConsumerTokenPayload } from '../member/member.service';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { AssistantContext } from './assistant.types';
import { ConversationService } from './conversation.service';
import { LlmAssistantService } from './llm-assistant.service';
import { AssistantToolRegistry } from './tools/assistant-tool-registry';
import { AssistantToolName } from './tools/assistant-tool.types';

interface ChatInput {
  tenantId: string;
  message: string;
  conversationId?: string;
  channel?: 'USER_APP' | 'STATION_WEB';
}

interface AssistantEvent {
  event: 'delta' | 'tool' | 'citation' | 'done';
  data: Record<string, unknown>;
}

@Injectable()
export class AssistantService {
  constructor(
    private readonly conversations: ConversationService,
    private readonly llm: LlmAssistantService,
    private readonly tools: AssistantToolRegistry,
  ) {}

  async chat(
    input: ChatInput,
    consumer: ConsumerTokenPayload,
  ): Promise<AssistantEvent[]> {
    return TenantContext.run(
      {
        userId: consumer.sub,
        tenantId: input.tenantId,
        roles: [],
        isPlatform: false,
      },
      () => this.chatInTenant(input, consumer),
    );
  }

  async listConversations(tenantId: string, consumer: ConsumerTokenPayload) {
    return TenantContext.run(
      {
        userId: consumer.sub,
        tenantId,
        roles: [],
        isPlatform: false,
      },
      () =>
        this.conversations.listConversations({
          actorType: 'CONSUMER',
          consumerId: consumer.sub,
        }),
    );
  }

  async listMessages(
    tenantId: string,
    conversationId: string,
    consumer: ConsumerTokenPayload,
  ) {
    return TenantContext.run(
      {
        userId: consumer.sub,
        tenantId,
        roles: [],
        isPlatform: false,
      },
      () =>
        this.conversations.listMessages(conversationId, {
          actorType: 'CONSUMER',
          consumerId: consumer.sub,
        }),
    );
  }

  private async chatInTenant(input: ChatInput, consumer: ConsumerTokenPayload) {
    const startedAt = Date.now();
    const conversationId =
      input.conversationId ??
      (
        (await this.conversations.createConversation({
          actorType: 'CONSUMER',
          consumerId: consumer.sub,
          channel: input.channel ?? 'USER_APP',
          mode: 'MOCK',
          title: input.message,
        })) as { id: string }
      ).id;

    if (input.conversationId) {
      await this.conversations.listMessages(conversationId, {
        actorType: 'CONSUMER',
        consumerId: consumer.sub,
      });
    }

    await this.conversations.appendMessage({
      conversationId,
      role: 'USER',
      content: input.message,
    });

    const ctx: AssistantContext = {
      tenantId: input.tenantId,
      actorType: 'CONSUMER',
      consumerId: consumer.sub,
      verifiedPhone: consumer.phone,
      channel: input.channel ?? 'USER_APP',
      conversationId,
    };
    const answer = await this.llm.ask(input.message, ctx);
    const events: AssistantEvent[] = [];

    for (const toolCall of answer.toolCalls) {
      const toolResult = await this.executeTool(toolCall, ctx);
      await this.conversations.appendMessage({
        conversationId,
        role: 'TOOL',
        content: JSON.stringify(toolResult.data),
        toolName: toolResult.name,
        toolPayload: toolResult.data,
      });
      events.push({
        event: 'tool',
        data: {
          name: toolResult.name,
          result: toolResult.data,
        },
      });
    }

    if (answer.text) {
      events.push({
        event: 'delta',
        data: { text: answer.text },
      });
    }
    for (const citation of answer.citations) {
      events.push({
        event: 'citation',
        data: citation as unknown as Record<string, unknown>,
      });
    }

    const assistantMessage = await this.conversations.appendMessage({
      conversationId,
      role: 'ASSISTANT',
      content: answer.text,
      citations: answer.citations,
      degraded: answer.degraded,
      latencyMs: Date.now() - startedAt,
    });
    events.push({
      event: 'done',
      data: {
        conversationId,
        messageId: assistantMessage.id,
        degraded: answer.degraded,
        mode: answer.mode,
        latencyMs: assistantMessage.latencyMs,
      },
    });

    return events;
  }

  private async executeTool(
    toolCall: Record<string, unknown>,
    ctx: AssistantContext,
  ) {
    const name = String(toolCall.name ?? toolCall.toolName ?? '');
    const args =
      toolCall.args && typeof toolCall.args === 'object'
        ? (toolCall.args as Record<string, unknown>)
        : {};
    const data = await this.tools.execute(name as AssistantToolName, args, ctx);
    return { name, data };
  }
}
