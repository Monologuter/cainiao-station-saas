import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TemplateRenderer } from '../apps/api/src/modules/notify/template-renderer';
import { getTestApp, closeTestApp } from './setup';

describe('Notify template config API e2e', () => {
  let app: INestApplication;
  let renderer: TemplateRenderer;

  beforeAll(async () => {
    app = await getTestApp();
    renderer = app.get(TemplateRenderer);
  });

  afterAll(() => closeTestApp());

  it('manages templates with notify scene validation and renderer hot reads', async () => {
    const adminToken = await login('admin', 'admin123456');
    const code = `QA_NOTIFY_${Date.now()}`;

    await request(app.getHttpServer())
      .post('/api/admin/config/dictionaries/notify_scene/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code, label: '质检通知', sort: 200 })
      .expect(201);

    const invalid = await request(app.getHttpServer())
      .post('/api/admin/config/notify-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `INVALID_${Date.now()}`,
        channel: 'SMS',
        content: '不会创建',
      })
      .expect(200);
    expect(invalid.body.code).toBe(1001);

    const created = await request(app.getHttpServer())
      .post('/api/admin/config/notify-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code,
        channel: 'SMS',
        content: '旧模板{code}',
        enabled: true,
      })
      .expect(201);
    expect(created.body.data).toMatchObject({
      code,
      channel: 'SMS',
      content: '旧模板{code}',
      enabled: true,
    });

    const updated = await request(app.getHttpServer())
      .patch(`/api/admin/config/notify-templates/${created.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ content: '新模板{code}', enabled: true })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      id: created.body.data.id,
      content: '新模板{code}',
    });

    await expect(
      renderer.render(code, 'SMS', { code: '1234' }),
    ).resolves.toEqual({ content: '新模板1234' });

    const list = await request(app.getHttpServer())
      .get('/api/admin/config/notify-templates')
      .query({ code })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

  it('rejects tenant users from template management', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken);

    const denied = await request(app.getHttpServer())
      .get('/api/admin/config/notify-templates')
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
    const phone = `132${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `模板租户${phone}`,
        ownerName: '模板店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    return { token: await login(phone, 'pw123456') };
  }
});
