import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { TenantContext } from '../../core/tenant-context/tenant-context';

type ActorRef =
  | { actorType: 'CONSUMER'; consumerId: string; staffUserId?: never }
  | { actorType: 'STAFF'; staffUserId: string; consumerId?: never };

type CreateConversationInput = ActorRef & {
  channel: 'USER_APP' | 'STATION_WEB';
  mode: 'MOCK' | 'REAL';
  title: string;
};

type AppendMessageInput = {
  conversationId: string;
  role: 'USER' | 'ASSISTANT' | 'TOOL';
  content: string;
  toolName?: string;
  toolPayload?: unknown;
  citations?: unknown;
  degraded?: boolean;
  latencyMs?: number;
};

@Injectable()
export class ConversationService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async createConversation(input: CreateConversationInput) {
    const tenantId = this.requireTenantId();
    return this.tenantPrisma.withTenant((tx) =>
      tx.aiConversation.create({
        data: {
          tenantId,
          actorType: input.actorType,
          consumerId: input.actorType === 'CONSUMER' ? input.consumerId : null,
          staffUserId: input.actorType === 'STAFF' ? input.staffUserId : null,
          channel: input.channel,
          mode: input.mode,
          title: input.title.slice(0, 120),
          status: 'ACTIVE',
          lastActiveAt: new Date(),
        },
      }),
    );
  }

  async listConversations(actor: ActorRef, page = 1, size = 20) {
    return this.tenantPrisma.withTenant((tx) =>
      tx.aiConversation.findMany({
        where: {
          ...this.actorWhere(actor),
          deletedAt: null,
        },
        orderBy: { lastActiveAt: 'desc' },
        skip: (Math.max(page, 1) - 1) * size,
        take: Math.min(Math.max(size, 1), 50),
      }),
    );
  }

  async appendMessage(input: AppendMessageInput) {
    const tenantId = this.requireTenantId();
    return this.tenantPrisma.withTenant(async (tx) => {
      const aggregate = await tx.aiMessage.aggregate({
        where: { conversationId: input.conversationId },
        _max: { seq: true },
      });
      const seq = (aggregate._max.seq ?? 0) + 1;

      const message = await tx.aiMessage.create({
        data: {
          tenantId,
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          toolName: input.toolName,
          toolPayload: input.toolPayload,
          citations: input.citations,
          degraded: input.degraded ?? false,
          latencyMs: input.latencyMs,
          seq,
        },
      });

      await tx.aiConversation.update({
        where: { id: input.conversationId },
        data: { lastActiveAt: new Date() },
      });

      return message;
    });
  }

  async listMessages(conversationId: string, actor: ActorRef) {
    return this.tenantPrisma.withTenant(async (tx) => {
      const conversation = await tx.aiConversation.findFirst({
        where: {
          id: conversationId,
          ...this.actorWhere(actor),
          deletedAt: null,
        },
      });
      if (!conversation) {
        throw new BizError(ApiCode.NOT_FOUND, '会话不存在');
      }

      return tx.aiMessage.findMany({
        where: { conversationId },
        orderBy: { seq: 'asc' },
      });
    });
  }

  private actorWhere(actor: ActorRef) {
    return actor.actorType === 'CONSUMER'
      ? { actorType: 'CONSUMER', consumerId: actor.consumerId }
      : { actorType: 'STAFF', staffUserId: actor.staffUserId };
  }

  private requireTenantId() {
    const tenantId = TenantContext.get()?.tenantId;
    if (!tenantId) {
      throw new BizError(ApiCode.UNAUTHORIZED, '缺少租户上下文');
    }
    return tenantId;
  }
}
