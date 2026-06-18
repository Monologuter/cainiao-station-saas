import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';
import { ApiCode } from '../apps/api/src/core/http/api-code';
import { ChannelResolver } from '../apps/api/src/modules/config/channel-resolver';

describe('Admin console smoke e2e', () => {
  let app: INestApplication;
  let channelResolver: ChannelResolver;

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
    channelResolver = app.get(ChannelResolver);
  });

  afterAll(() => app.close());

  it('links audited channel writes, runtime resolver, and platform monitor permissions', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken);

    await request(app.getHttpServer())
      .patch('/api/admin/config/channels/sms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'tencent', enabled: true, fallbackProvider: 'mock' })
      .expect(200);

    await expect(channelResolver.resolve('sms')).rejects.toMatchObject({
      code: ApiCode.NOT_IMPLEMENTED,
    });

    await waitForAudit();
    const audits = await request(app.getHttpServer())
      .get('/api/admin/audit-logs')
      .query({
        action: 'config.channel.update',
        resourceType: 'channel_config',
        result: 'SUCCESS',
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(audits.body.data.items.length).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .patch('/api/admin/config/channels/sms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ provider: 'mock', enabled: true, fallbackProvider: 'mock' })
      .expect(200);
    await expect(channelResolver.resolve('sms')).resolves.toMatchObject({
      channel: 'sms',
      provider: 'mock',
    });

    await request(app.getHttpServer())
      .get('/api/admin/monitor/overview')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const denied = await request(app.getHttpServer())
      .get('/api/admin/monitor/overview')
      .set('Authorization', `Bearer ${boss.token}`)
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
    const phone = `130${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `后台冒烟租户${phone}`,
        ownerName: '后台店长',
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
