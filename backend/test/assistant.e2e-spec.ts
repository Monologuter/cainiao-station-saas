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

  async function createConsumerSession(label: string) {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const adminToken = adminLogin.body.data.accessToken;
    const phone = `136${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;

    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `${label}-${Date.now()}`,
        ownerName: '助手店长',
        ownerPhone: `133${Math.floor(Math.random() * 100000000)
          .toString()
          .padStart(8, '0')}`,
        ownerPassword: 'pw123456',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/consumer/auth/send-code')
      .send({ phone })
      .expect(201);
    const verify = await request(app.getHttpServer())
      .post('/api/consumer/auth/verify')
      .send({ phone, code: '123456' })
      .expect(201);

    return {
      tenantId: open.body.data.tenantId as string,
      token: verify.body.data.pickToken as string,
    };
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
