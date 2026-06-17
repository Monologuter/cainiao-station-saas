import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';

describe('Analytics overview e2e', () => {
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

  it('returns tenant-isolated dashboard counters', async () => {
    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123456' })
      .expect(201);
    const adminToken = adminLogin.body.data.accessToken;

    const boss = await openTenant(adminToken, '统计闭环驿站');
    const quietBoss = await openTenant(adminToken, '统计空驿站');

    const shelf = await request(app.getHttpServer())
      .post(`/api/stations/${boss.stationId}/shelves`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ code: 'AN', name: '统计货架', zone: 'AN' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/shelves/${shelf.body.data.id}/slots/batch`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ rows: 1, levels: 1, cols: 3 })
      .expect(201);

    const first = await inbound(boss, '13800000001');
    await inbound(boss, '13800000002');

    await request(app.getHttpServer())
      .post('/api/pickup')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ stationId: boss.stationId, pickupCode: first.pickupCode })
      .expect(201);

    const overview = await request(app.getHttpServer())
      .get('/api/analytics/overview')
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);

    expect(overview.body.data).toMatchObject({
      inboundToday: 2,
      pickedToday: 1,
      inStock: 1,
      pickupRate: 50,
      overdueCount: 0,
      notifyToday: 4,
    });

    const quietOverview = await request(app.getHttpServer())
      .get('/api/analytics/overview')
      .set('Authorization', `Bearer ${quietBoss.token}`)
      .expect(200);

    expect(quietOverview.body.data).toMatchObject({
      inboundToday: 0,
      pickedToday: 0,
      inStock: 0,
      pickupRate: 0,
      overdueCount: 0,
      notifyToday: 0,
    });
  });

  async function openTenant(adminToken: string, name: string) {
    const phone = `135${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name,
        ownerName: '统计店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: phone, password: 'pw123456' })
      .expect(201);

    return {
      stationId: open.body.data.stationId as string,
      token: login.body.data.accessToken as string,
    };
  }

  async function inbound(
    boss: { stationId: string; token: string },
    phone: string,
  ) {
    const res = await request(app.getHttpServer())
      .post('/api/inbound')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({
        stationId: boss.stationId,
        waybillNo: `AN${Date.now()}${Math.floor(Math.random() * 1000)}`,
        carrier: 'YTO',
        receiverPhone: phone,
      })
      .expect(201);
    return res.body.data;
  }
});
