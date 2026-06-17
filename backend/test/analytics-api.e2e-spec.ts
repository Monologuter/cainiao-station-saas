import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';
import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';

describe('Analytics REST API e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
    prisma = app.get(PrismaService);
  });

  afterAll(() => app.close());

  it('exposes tenant analytics endpoints with tenant isolation', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken, 'api-main');
    const otherBoss = await openTenant(adminToken, 'api-other');
    await prepareStation(boss);
    await prepareStation(otherBoss);
    await inbound(boss, '13900001001');
    await inbound(otherBoss, '13900001002');
    await seedMetricDaily(boss, 'inbound', 7);
    await seedMetricDaily(otherBoss, 'inbound', 99);

    const overview = await request(app.getHttpServer())
      .get('/api/analytics/overview')
      .query({ stationId: boss.stationId })
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(overview.body.data).toMatchObject({
      inbound: 1,
      pickup: 0,
      stored: 1,
    });

    const trend = await request(app.getHttpServer())
      .get('/api/analytics/trend')
      .query({
        stationId: boss.stationId,
        metric: 'inbound',
        from: today(),
        to: today(),
      })
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(trend.body.data.points).toEqual([{ date: today(), value: 7 }]);

    const ranking = await request(app.getHttpServer())
      .get('/api/analytics/ranking')
      .query({ type: 'overdue', stationId: boss.stationId, limit: 5 })
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(ranking.body.data).toMatchObject({ type: 'overdue' });

    const heatmap = await request(app.getHttpServer())
      .get('/api/analytics/heatmap')
      .query({ stationId: boss.stationId })
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(heatmap.body.data.shelves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ shelfCode: 'AN', used: 1, capacity: 2 }),
      ]),
    );

    const compare = await request(app.getHttpServer())
      .get('/api/analytics/stations/compare')
      .query({ metric: 'inbound', date: today() })
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(compare.body.data.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stationId: boss.stationId, value: 1 }),
      ]),
    );
  });

  it('protects reconcile with analytics:reconcile permission', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken, 'api-reconcile');
    await prepareStation(boss);
    await inbound(boss, '13900001003');

    const denied = await request(app.getHttpServer())
      .post('/api/analytics/reconcile')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ stationId: boss.stationId, date: today() })
      .expect(200);
    expect(denied.body.code).toBe(1003);

    await grantBossPermission(boss.tenantId, 'analytics:reconcile');
    const elevatedToken = await login(boss.username, 'pw123456');
    const allowed = await request(app.getHttpServer())
      .post('/api/analytics/reconcile')
      .set('Authorization', `Bearer ${elevatedToken}`)
      .send({ stationId: boss.stationId, date: today() })
      .expect(201);
    expect(allowed.body.data).toMatchObject({ inbound: 1 });
  });

  it('exposes platform analytics only to platform users', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken, 'api-platform');

    const denied = await request(app.getHttpServer())
      .get('/api/admin/analytics/overview')
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(denied.body.code).toBe(1003);

    const overview = await request(app.getHttpServer())
      .get('/api/admin/analytics/overview')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(overview.body.data).toMatchObject({
      tenants: expect.any(Number),
      stations: expect.any(Number),
      parcels: expect.any(Number),
      gmv: expect.any(Number),
    });

    const compare = await request(app.getHttpServer())
      .get('/api/admin/analytics/tenants/compare')
      .query({ metric: 'inbound', date: today() })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(compare.body.data).toMatchObject({
      metric: 'inbound',
      rows: expect.any(Array),
    });
  });

  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    return res.body.data.accessToken as string;
  }

  async function openTenant(adminToken: string, suffix: string) {
    const phone = `137${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `运营大屏${suffix}`,
        ownerName: '统计店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    const token = await login(phone, 'pw123456');
    return {
      tenantId: open.body.data.tenantId as string,
      stationId: open.body.data.stationId as string,
      token,
      username: phone,
    };
  }

  async function prepareStation(boss: { stationId: string; token: string }) {
    const shelf = await request(app.getHttpServer())
      .post(`/api/stations/${boss.stationId}/shelves`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ code: 'AN', name: '运营货架', zone: 'AN' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/shelves/${shelf.body.data.id}/slots/batch`)
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ rows: 1, levels: 1, cols: 2 })
      .expect(201);
  }

  async function inbound(
    boss: { stationId: string; token: string },
    phone: string,
  ) {
    return request(app.getHttpServer())
      .post('/api/inbound')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({
        stationId: boss.stationId,
        waybillNo: `ANA${Date.now()}${Math.floor(Math.random() * 1000)}`,
        carrier: 'YTO',
        receiverPhone: phone,
      })
      .expect(201);
  }

  async function seedMetricDaily(
    boss: { tenantId: string; stationId: string },
    metric: string,
    value: number,
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      await tx.metricDaily.upsert({
        where: {
          tenantId_stationId_statDate_metric: {
            tenantId: boss.tenantId,
            stationId: boss.stationId,
            statDate: new Date(`${today()}T00:00:00.000Z`),
            metric,
          },
        },
        update: { value: BigInt(value) },
        create: {
          tenantId: boss.tenantId,
          stationId: boss.stationId,
          statDate: new Date(`${today()}T00:00:00.000Z`),
          metric,
          value: BigInt(value),
        },
      });
    });
  }

  async function grantBossPermission(tenantId: string, code: string) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const role = await tx.role.findFirstOrThrow({
        where: { tenantId, code: '店长' },
      });
      const permission = await tx.permission.findUniqueOrThrow({
        where: { code },
      });
      await tx.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    });
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }
});
