import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getTestApp, closeTestApp } from './setup';

describe('Member review closed loop e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterAll(() => closeTestApp());

  it('runs pickup points, checkin, coupon, review and complaint flow', async () => {
    const boss = await openTenant('会员评价闭环驿站');
    await prepareSlots(boss);
    const consumerPhone = `131${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const consumer = await verifyConsumer(consumerPhone);

    const inbound = await request(app.getHttpServer())
      .post('/api/inbound')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({
        stationId: boss.stationId,
        waybillNo: `MR${Date.now()}`,
        carrier: 'YTO',
        receiverPhone: consumerPhone,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/pickup')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({
        stationId: boss.stationId,
        pickupCode: inbound.body.data.pickupCode,
      })
      .expect(201);

    const pickupPoints = await request(app.getHttpServer())
      .get('/api/member/points/records')
      .set('Authorization', `Bearer ${consumer.token}`)
      .expect(200);
    expect(pickupPoints.body.data.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'PICKUP', change: 2 }),
      ]),
    );

    await request(app.getHttpServer())
      .post('/api/member/checkin')
      .set('Authorization', `Bearer ${consumer.token}`)
      .expect(201);

    const template = await request(app.getHttpServer())
      .post('/api/admin/coupon-templates')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({
        name: '闭环兑换券',
        type: 'DISCOUNT',
        faceValue: 1,
        threshold: 0,
        scene: 'ALL',
        costPoints: 1,
        totalStock: 20,
        validDays: 7,
      })
      .expect(201);

    const coupon = await request(app.getHttpServer())
      .post('/api/member/coupons/redeem')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({ templateId: template.body.data.id })
      .expect(201);
    expect(coupon.body.data.status).toBe('UNUSED');

    await request(app.getHttpServer())
      .post(`/api/member/coupons/${coupon.body.data.id}/verify`)
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({
        usedRefType: 'pickup',
        usedRefId: inbound.body.data.parcelId,
        idempotencyKey: `pickup-${inbound.body.data.parcelId}`,
      })
      .expect(201);

    const review = await request(app.getHttpServer())
      .post('/api/reviews')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({
        targetType: 'PICKUP',
        refType: 'parcel',
        refId: inbound.body.data.parcelId,
        rating: 5,
        content: '取件很顺畅',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/admin/reviews/${review.body.data.id}/reply`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ content: '感谢认可' })
      .expect(201);

    const complaint = await request(app.getHttpServer())
      .post('/api/complaints')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({
        type: 'SERVICE',
        refType: 'parcel',
        refId: inbound.body.data.parcelId,
        content: '希望延长营业时间',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/admin/complaints/${complaint.body.data.id}/handle`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ status: 'PROCESSING', note: '已受理' })
      .expect(201);

    const summary = await request(app.getHttpServer())
      .get('/api/admin/satisfaction/summary')
      .query({ from: '2026-01-01', to: '2026-12-31' })
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(summary.body.data).toMatchObject({
      avgRating: 5,
      reviewCount: expect.any(Number),
      complaintCount: expect.any(Number),
    });
  }, 90000);

  async function openTenant(name: string) {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const phone = `132${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({
        name,
        ownerName: '闭环店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: phone, password: 'pw123456' })
      .expect(201);
    return {
      tenantId: open.body.data.tenantId as string,
      stationId: open.body.data.stationId as string,
      token: login.body.data.accessToken as string,
    };
  }

  async function prepareSlots(boss: { token: string; stationId: string }) {
    const shelf = await request(app.getHttpServer())
      .post(`/api/stations/${boss.stationId}/shelves`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ code: `MR${Date.now()}`, name: '会员货架', zone: 'M' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/shelves/${shelf.body.data.id}/slots/batch`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ rows: 1, levels: 1, cols: 2 })
      .expect(201);
  }

  async function verifyConsumer(phone: string) {
    const sent = await request(app.getHttpServer())
      .post('/api/consumer/auth/send-code')
      .send({ phone })
      .expect(201);
    const verified = await request(app.getHttpServer())
      .post('/api/consumer/auth/verify')
      .send({ phone, code: sent.body.data.debugCode })
      .expect(201);
    return {
      token: verified.body.data.pickToken as string,
      consumerId: verified.body.data.consumerId as string,
    };
  }
});
