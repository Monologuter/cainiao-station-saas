import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../apps/api/src/app.module';
import { AllExceptionsFilter } from '../apps/api/src/core/http/all-exceptions.filter';
import { ResponseInterceptor } from '../apps/api/src/core/http/response.interceptor';
import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';

describe('Platform monitor API e2e', () => {
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

  it('returns platform overview, store health list, and store drilldown', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken);
    await seedMonitorData(boss.tenantId, boss.stationId);

    const overview = await request(app.getHttpServer())
      .get('/api/admin/monitor/overview')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(overview.body.data).toEqual(
      expect.objectContaining({
        tenants: expect.any(Number),
        stations: expect.any(Number),
        inStockParcels: expect.any(Number),
        exceptionCount: expect.any(Number),
        gmv: expect.any(Number),
      }),
    );

    const stores = await request(app.getHttpServer())
      .get('/api/admin/monitor/stores')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(stores.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: boss.tenantId,
          stationId: boss.stationId,
          health: expect.objectContaining({
            status: expect.stringMatching(/healthy|warning|critical/),
          }),
          metrics: expect.objectContaining({
            inStockParcels: 1,
            exceptionCount: 1,
            gmv: 8800,
          }),
        }),
      ]),
    );

    const detail = await request(app.getHttpServer())
      .get(`/api/admin/monitor/stores/${boss.stationId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.data).toMatchObject({
      tenantId: boss.tenantId,
      stationId: boss.stationId,
      subscription: { status: 'ACTIVE' },
      metrics: {
        inStockParcels: 1,
        exceptionCount: 1,
        gmv: 8800,
      },
    });
  }, 15000);

  it('rejects tenant users from monitor endpoints', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken);

    const denied = await request(app.getHttpServer())
      .get('/api/admin/monitor/overview')
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);
    expect(denied.body.code).toBe(1003);
  }, 10000);

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
        name: `监控租户${phone}`,
        ownerName: '监控店长',
        ownerPhone: phone,
        ownerPassword: 'pw123456',
      })
      .expect(201);
    return {
      tenantId: open.body.data.tenantId as string,
      stationId: open.body.data.stationId as string,
      token: await login(phone, 'pw123456'),
    };
  }

  async function seedMonitorData(tenantId: string, stationId: string) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const now = new Date();
      const parcel = await tx.parcel.create({
        data: {
          tenantId,
          stationId,
          waybillNo: `MN${Date.now()}A`,
          carrier: 'ZTO',
          receiverPhone: '13800000000',
          receiverPhoneTail: '0000',
          pickupCode: '1234',
          status: 'STORED',
          storedAt: now,
        },
      });
      await tx.exceptionTicket.create({
        data: {
          tenantId,
          stationId,
          parcelId: parcel.id,
          code: `EX${Date.now()}`,
          type: 'DAMAGED',
          status: 'OPEN',
          severity: 'HIGH',
          description: '破损',
          parcelStatusBefore: 'STORED',
        },
      });
      await tx.shipOrder.create({
        data: {
          tenantId,
          stationId,
          orderNo: `SO${Date.now()}`,
          channel: 'STATION',
          status: 'PAID',
          senderJson: {},
          receiverJson: {},
          itemJson: {},
          weightGram: 1000,
          courierCode: 'ZTO',
          courierName: '中通快递',
          quoteAmount: 8800,
          quoteSnapshotJson: {},
          paidAt: now,
        },
      });
      const plan = await tx.billingPlan.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { sort: 'asc' },
      });
      if (plan) {
        const end = new Date(now);
        end.setMonth(end.getMonth() + 1);
        await tx.subscription.create({
          data: {
            tenantId,
            stationId,
            planId: plan.id,
            status: 'ACTIVE',
            currentPeriodStart: now,
            currentPeriodEnd: end,
            nextBillingAt: end,
            startedAt: now,
            planSnapshot: { code: plan.code, name: plan.name },
          },
        });
      }
    });
  }
});
