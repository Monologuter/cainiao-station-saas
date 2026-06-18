import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getTestApp, closeTestApp } from './setup';

describe('Billing subscriptions e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(() => closeTestApp());

  it('opens, lists, renews, cancels and platform-suspends a subscription', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken);
    const plans = await request(app.getHttpServer())
      .get('/api/billing/plans')
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    const planId = plans.body.data[0].id;

    const created = await request(app.getHttpServer())
      .post('/api/billing/subscriptions')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ stationId: boss.stationId, planId })
      .expect(201);
    expect(created.body.data).toMatchObject({
      tenantId: boss.tenantId,
      stationId: boss.stationId,
      status: 'ACTIVE',
      planSnapshot: expect.objectContaining({
        monthlyPrice: expect.any(Number),
      }),
    });

    const duplicate = await request(app.getHttpServer())
      .post('/api/billing/subscriptions')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ stationId: boss.stationId, planId })
      .expect(200);
    expect(duplicate.body.code).toBe(1001);

    const listed = await request(app.getHttpServer())
      .get('/api/billing/subscriptions')
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(listed.body.data.map((item: any) => item.id)).toContain(
      created.body.data.id,
    );

    const renewed = await request(app.getHttpServer())
      .post(`/api/billing/subscriptions/${created.body.data.id}/renew`)
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(201);
    expect(new Date(renewed.body.data.currentPeriodStart).getTime()).toBe(
      new Date(created.body.data.currentPeriodEnd).getTime(),
    );

    const suspended = await request(app.getHttpServer())
      .post(`/api/billing/subscriptions/${created.body.data.id}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(suspended.body.data.status).toBe('SUSPENDED');

    const resumed = await request(app.getHttpServer())
      .post(`/api/billing/subscriptions/${created.body.data.id}/resume`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(resumed.body.data.status).toBe('ACTIVE');

    const canceled = await request(app.getHttpServer())
      .post(`/api/billing/subscriptions/${created.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(201);
    expect(canceled.body.data.status).toBe('CANCELED');
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
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '订阅生命周期驿站',
        ownerName: '订阅店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    const token = await login(phone, 'pw123456');
    return {
      tenantId: open.body.data.tenantId as string,
      stationId: open.body.data.stationId as string,
      token,
    };
  }
});
