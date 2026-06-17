import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Member API e2e', () => {
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

  it('exposes profile, checkin, points and coupon redemption to consumer token', async () => {
    const boss = await openTenant('会员 API 驿站');
    const consumer = await loginConsumer();

    const profile = await request(app.getHttpServer())
      .get('/api/member/profile')
      .set('Authorization', `Bearer ${consumer.token}`)
      .expect(200);
    expect(profile.body.data).toMatchObject({
      consumerId: consumer.consumerId,
      availablePoints: 0,
      continuousCheckinDays: 0,
    });

    const checkin = await request(app.getHttpServer())
      .post('/api/member/checkin')
      .set('Authorization', `Bearer ${consumer.token}`)
      .expect(201);
    expect(checkin.body.data).toMatchObject({
      rewardPoints: 1,
      continuousDays: 1,
    });

    const status = await request(app.getHttpServer())
      .get('/api/member/checkin/status')
      .query({ month: new Date().toISOString().slice(0, 7) })
      .set('Authorization', `Bearer ${consumer.token}`)
      .expect(200);
    expect(status.body.data.checkedToday).toBe(true);

    const points = await request(app.getHttpServer())
      .get('/api/member/points/records')
      .set('Authorization', `Bearer ${consumer.token}`)
      .expect(200);
    expect(points.body.data.list).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'CHECKIN' })]),
    );

    const template = await request(app.getHttpServer())
      .post('/api/admin/coupon-templates')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({
        name: '签到兑换券',
        type: 'DISCOUNT',
        faceValue: 1,
        threshold: 0,
        scene: 'ALL',
        costPoints: 1,
        totalStock: 10,
        validDays: 7,
      })
      .expect(201);

    const templates = await request(app.getHttpServer())
      .get('/api/member/coupon-templates')
      .query({ tenantId: boss.tenantId, scene: 'ALL' })
      .set('Authorization', `Bearer ${consumer.token}`)
      .expect(200);
    expect(templates.body.data.list).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: template.body.data.id }),
      ]),
    );

    const redeemed = await request(app.getHttpServer())
      .post('/api/member/coupons/redeem')
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({ templateId: template.body.data.id })
      .expect(201);
    expect(redeemed.body.data.status).toBe('UNUSED');

    const verified = await request(app.getHttpServer())
      .post(`/api/member/coupons/${redeemed.body.data.id}/verify`)
      .set('Authorization', `Bearer ${consumer.token}`)
      .send({
        usedRefType: 'pickup',
        usedRefId: 'mock-pickup',
        idempotencyKey: 'mock-pickup',
      })
      .expect(201);
    expect(verified.body.data.status).toBe('USED');
  }, 90000);

  async function loginConsumer() {
    const phone = `136${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    await request(app.getHttpServer())
      .post('/api/consumer/auth/send-code')
      .send({ phone })
      .expect(201);
    const verify = await request(app.getHttpServer())
      .post('/api/consumer/auth/verify')
      .send({ phone, code: '123456' })
      .expect(201);
    return {
      token: verify.body.data.pickToken as string,
      consumerId: verify.body.data.consumerId as string,
      phone,
    };
  }

  async function openTenant(name: string) {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const phone = `139${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({
        name,
        ownerName: '会员店长',
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
});
