import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Review API e2e', () => {
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

  it('lets consumers submit reviews and complaints, and staff handle them', async () => {
    const boss = await openTenant('评价 API 驿站');
    await prepareSlots(boss);
    const consumer = await loginConsumer();
    const inbound = await inboundParcel(boss, consumer.phone);

    const review = await request(app.getHttpServer())
      .post('/api/reviews')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({
        targetType: 'PICKUP',
        refType: 'parcel',
        refId: inbound.parcelId,
        rating: 5,
        tags: ['服务好'],
        content: '很快',
      })
      .expect(201);
    expect(review.body.data.status).toBe('PUBLISHED');

    const mineReviews = await request(app.getHttpServer())
      .get('/api/reviews/mine')
      .set('Authorization', `Bearer ${consumer.token}`)
      .expect(200);
    expect(mineReviews.body.data.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: review.body.data.id }),
      ]),
    );

    const replied = await request(app.getHttpServer())
      .post(`/api/admin/reviews/${review.body.data.id}/reply`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ content: '感谢认可' })
      .expect(201);
    expect(replied.body.data.status).toBe('REPLIED');

    const complaint = await request(app.getHttpServer())
      .post('/api/complaints')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({
        type: 'SERVICE',
        refType: 'parcel',
        refId: inbound.parcelId,
        content: '服务需改进',
      })
      .expect(201);
    expect(complaint.body.data.status).toBe('PENDING');

    const mineComplaints = await request(app.getHttpServer())
      .get('/api/complaints/mine')
      .set('Authorization', `Bearer ${consumer.token}`)
      .expect(200);
    expect(mineComplaints.body.data.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: complaint.body.data.id }),
      ]),
    );

    const processing = await request(app.getHttpServer())
      .post(`/api/admin/complaints/${complaint.body.data.id}/handle`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ status: 'PROCESSING', note: '已受理' })
      .expect(201);
    expect(processing.body.data.status).toBe('PROCESSING');

    const summary = await request(app.getHttpServer())
      .get('/api/admin/satisfaction/summary')
      .query({
        stationId: boss.stationId,
        from: '2026-01-01',
        to: '2026-12-31',
      })
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(summary.body.data).toMatchObject({
      avgRating: 5,
      reviewCount: expect.any(Number),
      complaintCount: expect.any(Number),
    });

    const permissions = await request(app.getHttpServer())
      .get('/api/auth/permissions')
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(permissions.body.data).toEqual(
      expect.arrayContaining([
        'review:read',
        'review:reply',
        'complaint:handle',
        'coupon:manage',
      ]),
    );
  }, 90000);

  async function loginConsumer() {
    const phone = `135${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const sent = await request(app.getHttpServer())
      .post('/api/consumer/auth/send-code')
      .send({ phone })
      .expect(201);
    const verify = await request(app.getHttpServer())
      .post('/api/consumer/auth/verify')
      .send({ phone, code: sent.body.data.debugCode })
      .expect(201);
    return { token: verify.body.data.pickToken as string, phone };
  }

  async function openTenant(name: string) {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const phone = `138${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({
        name,
        ownerName: '评价店长',
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

  async function prepareSlots(boss: { stationId: string; token: string }) {
    const shelf = await request(app.getHttpServer())
      .post(`/api/stations/${boss.stationId}/shelves`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ code: `RV${Date.now()}`, name: '评价货架', zone: 'R' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/shelves/${shelf.body.data.id}/slots/batch`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ rows: 1, levels: 1, cols: 2 })
      .expect(201);
  }

  async function inboundParcel(
    boss: { stationId: string; token: string },
    phone: string,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/inbound')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({
        stationId: boss.stationId,
        waybillNo: `RV${Date.now()}`,
        carrier: 'YTO',
        receiverPhone: phone,
      })
      .expect(201);
    return res.body.data;
  }
});
