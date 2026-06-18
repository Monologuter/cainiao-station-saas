import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getTestApp, closeTestApp } from './setup';

describe('Billing invoice e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(() => closeTestApp());

  it('generates, lists, details, dedups and voids invoices', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken);
    const planId = await createPlan(adminToken);

    const subscription = await request(app.getHttpServer())
      .post('/api/billing/subscriptions')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ stationId: boss.stationId, planId })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/billing/usage/meter')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tenantId: boss.tenantId,
        stationId: boss.stationId,
        eventId: `invoice-sms-${Date.now()}`,
        metric: 'SMS',
        quantity: 3,
      })
      .expect(201);

    const generated = await request(app.getHttpServer())
      .post('/api/billing/invoices/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tenantId: boss.tenantId,
        subscriptionId: subscription.body.data.id,
      })
      .expect(201);
    expect(generated.body.data).toMatchObject({
      tenantId: boss.tenantId,
      subscriptionId: subscription.body.data.id,
      status: 'OPEN',
      baseAmount: 1000,
      overageAmount: 10,
      totalAmount: 1010,
    });

    const duplicate = await request(app.getHttpServer())
      .post('/api/billing/invoices/run')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tenantId: boss.tenantId,
        subscriptionId: subscription.body.data.id,
        periodStart: generated.body.data.periodStart,
      })
      .expect(201);
    expect(duplicate.body.data.id).toBe(generated.body.data.id);

    const listed = await request(app.getHttpServer())
      .get('/api/billing/invoices')
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(listed.body.data.map((item: any) => item.id)).toContain(
      generated.body.data.id,
    );

    const detail = await request(app.getHttpServer())
      .get(`/api/billing/invoices/${generated.body.data.id}`)
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(detail.body.data.lineItems).toEqual(
      expect.arrayContaining([
        { type: 'BASE', amount: 1000 },
        expect.objectContaining({ type: 'OVERAGE', metric: 'SMS', amount: 10 }),
      ]),
    );

    const voided = await request(app.getHttpServer())
      .post(`/api/billing/invoices/${generated.body.data.id}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(voided.body.data.status).toBe('VOID');
  });

  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    return res.body.data.accessToken as string;
  }

  async function createPlan(adminToken: string) {
    const res = await request(app.getHttpServer())
      .post('/api/billing/plans')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `INV_${Date.now()}`,
        name: '出账测试套餐',
        monthlyPrice: 1000,
        quotas: { sms: 1, parcels: -1, stations: 1 },
        overagePrices: { sms: 5, parcels: 0, stations: 99900 },
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function openTenant(adminToken: string) {
    const phone = `132${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '出账驿站',
        ownerName: '出账店长',
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
