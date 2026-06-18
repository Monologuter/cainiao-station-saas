import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { ConversationService } from './conversation.service';

describe('ConversationService', () => {
  const tx = {
    aiConversation: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    aiMessage: {
      aggregate: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const tenantPrisma = {
    withTenant: jest.fn((fn) => fn(tx)),
  };
  let service: ConversationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationService(tenantPrisma as any);
  });

  it('creates tenant-scoped consumer conversations', async () => {
    tx.aiConversation.create.mockResolvedValue({ id: 'conv-1' });

    const result = await runAsTenant(() =>
      service.createConversation({
        actorType: 'CONSUMER',
        consumerId: 'consumer-1',
        channel: 'USER_APP',
        mode: 'MOCK',
        title: '我的包裹到了吗',
      }),
    );

    expect(result).toEqual({ id: 'conv-1' });
    expect(tx.aiConversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        actorType: 'CONSUMER',
        consumerId: 'consumer-1',
        channel: 'USER_APP',
        mode: 'MOCK',
        title: '我的包裹到了吗',
      }),
    });
  });

  it('lists only the current consumer conversations', async () => {
    tx.aiConversation.findMany.mockResolvedValue([{ id: 'conv-1' }]);

    await runAsTenant(() =>
      service.listConversations({
        actorType: 'CONSUMER',
        consumerId: 'consumer-1',
      }),
    );

    expect(tx.aiConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          actorType: 'CONSUMER',
          consumerId: 'consumer-1',
          deletedAt: null,
        },
      }),
    );
  });

  it('appends messages with the next sequence number', async () => {
    tx.aiMessage.aggregate.mockResolvedValue({ _max: { seq: 2 } });
    tx.aiMessage.create.mockResolvedValue({ id: 'msg-3', seq: 3 });

    const result = await runAsTenant(() =>
      service.appendMessage({
        conversationId: 'conv-1',
        role: 'ASSISTANT',
        content: '您有 1 件包裹待取。',
        degraded: true,
        citations: [{ id: 'faq-1' }],
      }),
    );

    expect(result).toEqual({ id: 'msg-3', seq: 3 });
    expect(tx.aiMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        conversationId: 'conv-1',
        role: 'ASSISTANT',
        seq: 3,
        degraded: true,
      }),
    });
  });

  it('rejects message history when the conversation is not owned by actor', async () => {
    tx.aiConversation.findFirst.mockResolvedValue(null);

    await expect(
      runAsTenant(() =>
        service.listMessages('conv-1', {
          actorType: 'CONSUMER',
          consumerId: 'consumer-1',
        }),
      ),
    ).rejects.toEqual(new BizError(ApiCode.NOT_FOUND, '会话不存在'));
  });

  function runAsTenant<T>(fn: () => T) {
    return TenantContext.run(
      {
        userId: 'user-1',
        tenantId: 'tenant-1',
        roles: [],
        isPlatform: false,
      },
      fn,
    );
  }
});
