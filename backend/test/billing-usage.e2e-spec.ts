import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getTestApp, getTestPrisma, closeTestApp } from './setup';
import type { PrismaService } from '../apps/api/src/core/prisma/prisma.service';

describe('Billing usage e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await getTestApp();
    prisma = getTestPrisma();
  });

  afterAll(() => closeTestApp());

  it('meters usage idempotently and records SMS usage after notification is sent', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken);
    const planId = await firstPlanId(boss.token);

    await request(app.getHttpServer())
      .post('/api/billing/subscriptions')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ stationId: boss.stationId, planId })
      .expect(201);

    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        request(app.getHttpServer())
          .post('/api/billing/usage/meter')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            tenantId: boss.tenantId,
            stationId: boss.stationId,
            eventId: `manual-${Date.now()}-${index}`,
            metric: 'SMS',
            quantity: 2,
            eventAt: new Date().toISOString(),
          })
          .expect(201),
      ),
    );

    const duplicateEventId = `manual-duplicate-${Date.now()}`;
    await request(app.getHttpServer())
      .post('/api/billing/usage/meter')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tenantId: boss.tenantId,
        stationId: boss.stationId,
        eventId: duplicateEventId,
        metric: 'SMS',
        quantity: 9,
      })
      .expect(201);
    const duplicate = await request(app.getHttpServer())
      .post('/api/billing/usage/meter')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tenantId: boss.tenantId,
        stationId: boss.stationId,
        eventId: duplicateEventId,
        metric: 'SMS',
        quantity: 9,
      })
      .expect(201);
    expect(duplicate.body.data).toEqual({ counted: false, duplicate: true });

    await createShelfAndSlots(boss.token, boss.stationId);
    await request(app.getHttpServer())
      .post('/api/inbound')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({
        stationId: boss.stationId,
        waybillNo: `SMS${Date.now()}`,
        carrier: 'YTO',
        receiverPhone: '13800000000',
      })
      .expect(201);

    const usage = await waitForUsageQuantity(boss.tenantId, BigInt(20));
    expect(usage).toBe(BigInt(20));
  });

  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    return res.body.data.accessToken as string;
  }

  async function firstPlanId(token: string) {
    const res = await request(app.getHttpServer())
      .get('/api/billing/plans')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.data[0].id as string;
  }

  async function openTenant(adminToken: string) {
    const phone = `131${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '计量驿站',
        ownerName: '计量店长',
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

  async function createShelfAndSlots(token: string, stationId: string) {
    const shelf = await request(app.getHttpServer())
      .post(`/api/stations/${stationId}/shelves`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `U${Date.now()}`, name: '计量货架', zone: 'U' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/shelves/${shelf.body.data.id}/slots/batch`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rows: 1, levels: 1, cols: 1 })
      .expect(201);
  }

  async function usageQuantity(tenantId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const row = await tx.usageRecord.findFirstOrThrow({
        where: { tenantId, metric: 'SMS' },
      });
      return row.quantity;
    });
  }

  async function waitForUsageQuantity(
    tenantId: string,
    expected: bigint,
    timeoutMs = 5000,
  ) {
    const deadline = Date.now() + timeoutMs;
    let latest = BigInt(0);
    while (Date.now() < deadline) {
      latest = await usageQuantity(tenantId);
      if (latest >= expected) {
        return latest;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return latest;
  }
});
