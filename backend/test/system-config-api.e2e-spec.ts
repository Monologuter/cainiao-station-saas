import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getTestApp, closeTestApp } from './setup';

describe('System config API e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(() => closeTestApp());

  it('lists system configs, blocks readonly edits, and hot updates editable values', async () => {
    const adminToken = await login('admin', 'admin123456');
    const nextLimit = 6100 + Math.floor(Math.random() * 100);

    const list = await request(app.getHttpServer())
      .get('/api/admin/config/system')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          configKey: 'security.jwt.expires_in',
          editable: false,
        }),
        expect.objectContaining({
          configKey: 'notify.sms.daily_limit',
          editable: true,
        }),
      ]),
    );

    const readonly = await request(app.getHttpServer())
      .patch('/api/admin/config/system/security.jwt.expires_in')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: '30d' })
      .expect(200);
    expect(readonly.body.code).toBe(1001);

    const updated = await request(app.getHttpServer())
      .patch('/api/admin/config/system/notify.sms.daily_limit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: nextLimit })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      configKey: 'notify.sms.daily_limit',
      value: nextLimit,
      effectiveValue: nextLimit,
    });

    const after = await request(app.getHttpServer())
      .get('/api/admin/config/system')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(after.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          configKey: 'notify.sms.daily_limit',
          effectiveValue: nextLimit,
        }),
      ]),
    );
  });

  it('rejects tenant users from system config management', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken);

    const denied = await request(app.getHttpServer())
      .get('/api/admin/config/system')
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
    const phone = `134${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `配置租户${phone}`,
        ownerName: '配置店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    return { token: await login(phone, 'pw123456') };
  }
});
