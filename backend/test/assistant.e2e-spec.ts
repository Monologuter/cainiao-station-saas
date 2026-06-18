import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';
import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { AssistantClient } from '../apps/api/src/modules/ai/assistant.client';

describe('Assistant API e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const assistantClient = {
    ask: jest.fn(),
    continueWithToolResult: jest.fn(),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AssistantClient)
      .useValue(assistantClient)
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(() => app.close());

  beforeEach(() => {
    assistantClient.ask.mockReset();
    assistantClient.continueWithToolResult.mockReset();
  });

  it('streams assistant deltas, citations and done events', async () => {
    assistantClient.ask.mockResolvedValue({
      text: '您的包裹已到站，请凭取件码取件。',
      citations: [
        {
          id: 'faq-1',
          category: 'PICKUP',
          question: '怎么取件？',
          source: 'test',
          score: 1,
        },
      ],
      toolCalls: [],
      degraded: false,
      mode: 'MOCK',
    });
    const { tenantId, token } = await createConsumerSession('assistant-sse');

    const res = await request(app.getHttpServer())
      .post('/api/assistant/chat')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'text/event-stream')
      .send({ tenantId, message: '我的包裹到了吗？' })
      .expect(201);

    expect(res.text).toContain('event: delta');
    expect(res.text).toContain('您的包裹已到站');
    expect(res.text).toContain('event: citation');
    expect(res.text).toContain('event: done');
    expect(res.text).toContain('"degraded":false');
  });

  it('lists only current consumer conversations and messages', async () => {
    assistantClient.ask.mockResolvedValue({
      text: '您好，我可以帮您查包裹。',
      citations: [],
      toolCalls: [],
      degraded: false,
      mode: 'MOCK',
    });
    const { tenantId, token } = await createConsumerSession('assistant-owner');
    const other = await createConsumerSession('assistant-other');

    const chat = await request(app.getHttpServer())
      .post('/api/assistant/chat')
      .set('Authorization', `Bearer ${token}`)
      .send({ tenantId, message: '你好' })
      .expect(201);
    const done = parseSse(chat.text, 'done')[0];

    const ownConversations = await request(app.getHttpServer())
      .get('/api/assistant/conversations')
      .query({ tenantId })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(ownConversations.body.data[0].id).toBe(done.conversationId);

    const ownMessages = await request(app.getHttpServer())
      .get(`/api/assistant/conversations/${done.conversationId}/messages`)
      .query({ tenantId })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(ownMessages.body.data.map((item: any) => item.role)).toEqual([
      'USER',
      'ASSISTANT',
    ]);

    const otherConversations = await request(app.getHttpServer())
      .get('/api/assistant/conversations')
      .query({ tenantId })
      .set('Authorization', `Bearer ${other.token}`)
      .expect(200);
    expect(otherConversations.body.data).toEqual([]);

    const deniedMessages = await request(app.getHttpServer())
      .get(`/api/assistant/conversations/${done.conversationId}/messages`)
      .query({ tenantId })
      .set('Authorization', `Bearer ${other.token}`)
      .expect(200);
    expect(deniedMessages.body.code).toBe(1004);
  });

  it('marks done as degraded when the LLM client falls back to FAQ', async () => {
    assistantClient.ask.mockRejectedValue(new Error('llm unavailable'));
    const { tenantId, token } =
      await createConsumerSession('assistant-fallback');
    await seedFaq();

    const res = await request(app.getHttpServer())
      .post('/api/assistant/chat')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept', 'text/event-stream')
      .send({ tenantId, message: '怎么取件？' })
      .expect(201);
    const done = parseSse(res.text, 'done')[0];

    expect(done.degraded).toBe(true);
    expect(res.text).toContain('event: citation');
  });

  it('executes parcel tool calls and stores only masked tool payload', async () => {
    const session = await createConsumerSession('assistant-tool');
    await prepareSlots(session);
    const inboundResult = await inbound(session, session.phone);
    assistantClient.ask.mockResolvedValue({
      text: '',
      citations: [],
      toolCalls: [
        {
          turnId: 'turn-parcel',
          name: 'query_my_parcels',
          args: {
            status: 'STORED',
            phone: '13999999999',
            tenantId: 'evil-tenant',
          },
        },
      ],
      degraded: false,
      mode: 'MOCK',
    });
    assistantClient.continueWithToolResult.mockImplementation(
      async (_turnId: string, _toolName: string, result: any) => ({
        text: `您有 ${result.items.length} 件包裹待取，取件码 ${result.items[0].pickupCode}。`,
        citations: [],
        toolCalls: [],
        degraded: true,
        mode: 'MOCK',
      }),
    );

    const chat = await request(app.getHttpServer())
      .post('/api/assistant/chat')
      .set('Authorization', `Bearer ${session.token}`)
      .set('Accept', 'text/event-stream')
      .send({ tenantId: session.tenantId, message: '我的包裹到了吗？' })
      .expect(201);
    const done = parseSse(chat.text, 'done')[0];

    expect(chat.text).toContain('event: tool');
    expect(chat.text).toContain(inboundResult.pickupCode);
    expect(assistantClient.continueWithToolResult).toHaveBeenCalledWith(
      'turn-parcel',
      'query_my_parcels',
      expect.objectContaining({
        items: [
          expect.objectContaining({
            pickupCode: inboundResult.pickupCode,
            receiverPhoneMasked: `${session.phone.slice(0, 3)}****${session.phone.slice(-4)}`,
          }),
        ],
      }),
    );

    const messages = await request(app.getHttpServer())
      .get(`/api/assistant/conversations/${done.conversationId}/messages`)
      .query({ tenantId: session.tenantId })
      .set('Authorization', `Bearer ${session.token}`)
      .expect(200);
    const tool = messages.body.data.find((item: any) => item.role === 'TOOL');
    expect(tool.content).toContain(inboundResult.pickupCode);
    expect(tool.content).not.toContain(session.phone);
  });

  async function createConsumerSession(label: string) {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const adminToken = adminLogin.body.data.accessToken;
    const phone = `136${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const ownerPhone = `133${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;

    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `${label}-${Date.now()}`,
        ownerName: '助手店长',
        ownerPhone,
        ownerPassword: 'pw123456',
      })
      .expect(201);

    const ownerLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: ownerPhone, password: 'pw123456' })
      .expect(201);

    const sent = await request(app.getHttpServer())
      .post('/api/consumer/auth/send-code')
      .send({ phone })
      .expect(201);
    const verify = await request(app.getHttpServer())
      .post('/api/consumer/auth/verify')
      .send({ phone, code: sent.body.data.debugCode })
      .expect(201);

    return {
      tenantId: open.body.data.tenantId as string,
      stationId: open.body.data.stationId as string,
      ownerToken: ownerLogin.body.data.accessToken as string,
      token: verify.body.data.pickToken as string,
      phone,
    };
  }

  async function prepareSlots(session: {
    stationId: string;
    ownerToken: string;
  }) {
    const shelf = await request(app.getHttpServer())
      .post(`/api/stations/${session.stationId}/shelves`)
      .set('Authorization', `Bearer ${session.ownerToken}`)
      .send({ code: 'A', name: '助手货架', zone: 'A' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/shelves/${shelf.body.data.id}/slots/batch`)
      .set('Authorization', `Bearer ${session.ownerToken}`)
      .send({ rows: 1, levels: 1, cols: 2 })
      .expect(201);
  }

  async function inbound(
    session: { stationId: string; ownerToken: string },
    phone: string,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/inbound')
      .set('Authorization', `Bearer ${session.ownerToken}`)
      .send({
        stationId: session.stationId,
        waybillNo: `AT${Date.now()}${Math.floor(Math.random() * 1000)}`,
        carrier: 'YTO',
        receiverPhone: phone,
      })
      .expect(201);
    return res.body.data;
  }

  async function seedFaq() {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      await tx.faqEntry.create({
        data: {
          tenantId: null,
          category: 'PICKUP',
          question: `怎么取件？${Date.now()}`,
          answer: '收到取件码后到对应驿站出示取件码即可取件。',
          keywords: ['取件'],
          priority: 100,
          enabled: true,
          source: 'assistant-api-e2e',
        },
      });
    });
  }

  function parseSse(text: string, event: string) {
    return text
      .split('\n\n')
      .filter((chunk) => chunk.includes(`event: ${event}`))
      .map((chunk) => {
        const data = chunk
          .split('\n')
          .find((line) => line.startsWith('data: '))
          ?.slice(6);
        return JSON.parse(data ?? '{}');
      });
  }
});
