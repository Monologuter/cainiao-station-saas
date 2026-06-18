import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { PrismaService } from '../apps/api/src/core/prisma/prisma.service';
import { getTestApp, getTestPrisma, closeTestApp } from './setup';

describe('Volume forecast e2e', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const migration = join(
    __dirname,
    '../prisma/migrations/20260618231000_volume_forecasts/migration.sql',
  );

  beforeAll(async () => {
    app = await getTestApp();
    prisma = getTestPrisma();
  });

  afterAll(() => closeTestApp());

  it('declares volume_forecasts with RLS and FORCE', () => {
    expect(existsSync(migration)).toBe(true);
    const sql = readFileSync(migration, 'utf8');

    expect(sql).toContain('CREATE TYPE "ForecastGranularity"');
    expect(sql).toContain('CREATE TYPE "ForecastMethod"');
    expect(sql).toContain('CREATE TABLE "volume_forecasts"');
    expect(sql).toContain('"tenant_id" UUID NOT NULL');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY "volume_forecasts_tenant_isolation"');
  });

  it('runs local fallback forecast and returns tenant-scoped forecast rows', async () => {
    const adminToken = await login('admin', 'admin123456');
    const boss = await openTenant(adminToken, 'forecast-main');
    const otherBoss = await openTenant(adminToken, 'forecast-other');
    await seedHistory(boss, [1, 2, 3, 4, 5, 6, 7]);
    await seedHistory(otherBoss, [99, 99, 99, 99, 99, 99, 99]);

    const run = await request(app.getHttpServer())
      .post('/api/analytics/forecast/run')
      .set('Authorization', `Bearer ${boss.token}`)
      .send({ stationId: boss.stationId, horizon: 7, granularity: 'DAY' })
      .expect(201);

    expect(run.body.data).toMatchObject({
      stationId: boss.stationId,
      granularity: 'DAY',
      method: 'FALLBACK_MEAN',
    });
    expect(run.body.data.forecasts).toHaveLength(7);
    expect(run.body.data.forecasts[0]).toMatchObject({
      targetDate: '2026-06-08',
      predictedVolume: 5,
    });

    const list = await request(app.getHttpServer())
      .get('/api/analytics/forecast/volume')
      .query({
        stationId: boss.stationId,
        from: '2026-06-08',
        to: '2026-06-14',
        granularity: 'DAY',
      })
      .set('Authorization', `Bearer ${boss.token}`)
      .expect(200);

    expect(list.body.data.items).toHaveLength(7);
    expect(list.body.data.items[0]).toMatchObject({
      stationId: boss.stationId,
      method: 'FALLBACK_MEAN',
      predictedVolume: 5,
    });
    expect(
      list.body.data.items.some((item: any) => item.predictedVolume === 99),
    ).toBe(false);
  });

  async function login(username: string, password: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    return res.body.data.accessToken as string;
  }

  async function openTenant(adminToken: string, suffix: string) {
    const phone = `132${Math.floor(Math.random() * 100000000)
      .toString()
      .padStart(8, '0')}`;
    const open = await request(app.getHttpServer())
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `预测驿站${suffix}`,
        ownerName: '预测店长',
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

  async function seedHistory(
    boss: { tenantId: string; stationId: string },
    values: number[],
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      for (const [index, value] of values.entries()) {
        await tx.metricDaily.upsert({
          where: {
            tenantId_stationId_statDate_metric: {
              tenantId: boss.tenantId,
              stationId: boss.stationId,
              statDate: new Date(`2026-06-0${index + 1}T00:00:00.000Z`),
              metric: 'inbound',
            },
          },
          update: { value },
          create: {
            tenantId: boss.tenantId,
            stationId: boss.stationId,
            statDate: new Date(`2026-06-0${index + 1}T00:00:00.000Z`),
            metric: 'inbound',
            value,
          },
        });
      }
    });
  }
});
