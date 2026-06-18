import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getTestApp, closeTestApp } from './setup';

describe('Channel config API e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(() => closeTestApp());

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
