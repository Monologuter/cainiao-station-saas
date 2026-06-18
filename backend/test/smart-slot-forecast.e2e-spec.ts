import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';
import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { SlotRecommenderClient } from '../apps/api/src/modules/station/slot-recommender.client';

describe('Smart slot and forecast e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const recommender = {
    recommend: jest.fn((input: any) => [
      {
        slotId: input.candidates[1]?.slotId ?? input.candidates[0]?.slotId,
        score: 0.96,
        reasons: ['近门动线', '错峰取件'],
      },
    ]),
  };

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SlotRecommenderClient)
      .useValue(recommender)
      .compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(() => app.close());

  it('uses mock AI slot recommendation, records heat and exposes forecast data', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken);
    await createSlots(boss);
    await seedHistory(boss, [6, 8, 10, 12, 14, 16, 18]);

    const inbound = await request(app.getHttpServer())
      .post('/api/inbound')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({
        stationId: boss.stationId,
        waybillNo: `SMART${Date.now()}`,
        carrier: 'YTO',
        receiverPhone: '13800000000',
      })
      .expect(201);

    expect(recommender.recommend).toHaveBeenCalled();
    expect(inbound.body.data).toMatchObject({
      status: 'STORED',
      slotCode: 'A-01-01-02',
      slotSource: 'AI',
      slotReasons: ['近门动线', '错峰取件'],
    });

    await request(app.getHttpServer())
      .post('/api/pickup')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({
        stationId: boss.stationId,
        pickupCode: inbound.body.data.pickupCode,
        phoneTail: '0000',
      })
      .expect(201);

    const today = new Date().toISOString().slice(0, 10);
    const heatmap = await request(app.getHttpServer())
      .get(`/api/stations/${boss.stationId}/slots/heatmap`)
      .query({ date: today })
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);

    expect(heatmap.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotCode: 'A-01-01-02',
          pickCount: 1,
        }),
      ]),
    );

    const forecastRun = await request(app.getHttpServer())
      .post('/api/analytics/forecast/run')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ stationId: boss.stationId, horizon: 7, granularity: 'DAY' })
      .expect(201);

    expect(forecastRun.body.data).toMatchObject({
      stationId: boss.stationId,
      granularity: 'DAY',
      method: 'FALLBACK_MEAN',
    });
    expect(forecastRun.body.data.forecasts).toHaveLength(7);

    const firstTarget = forecastRun.body.data.forecasts[0].targetDate;
    const lastTarget = forecastRun.body.data.forecasts[6].targetDate;
    const forecastList = await request(app.getHttpServer())
      .get('/api/analytics/forecast/volume')
      .query({
        stationId: boss.stationId,
        from: firstTarget,
        to: lastTarget,
        granularity: 'DAY',
      })
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);

    expect(forecastList.body.data.items).toHaveLength(7);
    expect(forecastList.body.data.items[0]).toMatchObject({
      stationId: boss.stationId,
      method: 'FALLBACK_MEAN',
      predictedVolume: 14,
    });
  });

  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    return res.body.data.accessToken as string;
  }

  async function openTenant(adminToken: string) {
    const phone = `131${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '智能库位预测驿站',
        ownerName: '智能店长',
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

  async function createSlots(boss: { stationId: string; token: string }) {
    const shelf = await request(app.getHttpServer())
      .post(`/api/stations/${boss.stationId}/shelves`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ code: 'A', name: 'A 区货架', zone: 'A' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/shelves/${shelf.body.data.id}/slots/batch`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ rows: 1, levels: 1, cols: 2 })
      .expect(201);
  }

  async function seedHistory(
    boss: { tenantId: string; stationId: string },
    values: number[],
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      for (const [index, value] of values.entries()) {
        const statDate = new Date(Date.UTC(2026, 5, index + 1, 0, 0, 0, 0));
        await tx.metricDaily.upsert({
          where: {
            tenantId_stationId_statDate_metric: {
              tenantId: boss.tenantId,
              stationId: boss.stationId,
              statDate,
              metric: 'inbound',
            },
          },
          update: { value },
          create: {
            tenantId: boss.tenantId,
            stationId: boss.stationId,
            statDate,
            metric: 'inbound',
            value,
          },
        });
      }
    });
  }
});
