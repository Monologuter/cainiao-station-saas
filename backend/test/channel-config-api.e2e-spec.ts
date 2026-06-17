import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Channel config API e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(() => app.close());

  it('hot switches registered providers and writes audit logs', async () => {
    const adminToken = await login('admin', 'admin123456');

    const invalid = await request(app.getHttpServer())
      .patch('/api/admin/config/channels/sms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'kuaidi100' })
      .expect(200);
    expect(invalid.body.code).toBe(1001);

    const updated = await request(app.getHttpServer())
      .patch('/api/admin/config/channels/sms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'tencent', enabled: true, fallbackProvider: 'mock' })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      channel: 'sms',
      provider: 'tencent',
      enabled: true,
      fallbackProvider: 'mock',
      registeredProviders: ['mock', 'tencent'],
    });

    const list = await request(app.getHttpServer())
      .get('/api/admin/config/channels')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: 'sms', provider: 'tencent' }),
      ]),
    );

    await waitForAudit();
    const audits = await request(app.getHttpServer())
      .get('/api/admin/audit-logs')
      .query({
        action: 'config.channel.update',
        resourceType: 'channel_config',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(audits.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'config.channel.update',
          resourceType: 'channel_config',
          result: 'SUCCESS',
        }),
      ]),
    );

    await request(app.getHttpServer())
      .patch('/api/admin/config/channels/sms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'mock', enabled: true, fallbackProvider: 'mock' })
      .expect(200);
  });

  it('rejects tenant users from channel management', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken);

    const denied = await request(app.getHttpServer())
      .patch('/api/admin/config/channels/sms')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ provider: 'mock' })
      .expect(200);
    expect(denied.body.code).toBe(1003);
  });

  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    return res.body.data.accessToken as string;
  }

  async function openTenant(adminToken: string) {
    const phone = `133${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `渠道租户${phone}`,
        ownerName: '渠道店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    return { token: await login(phone, 'pw123456') };
  }

  function waitForAudit() {
    return new Promise((resolve) => setTimeout(resolve, 50));
  }
});
