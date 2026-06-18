import { getTestPrisma, closeTestApp } from './setup';

describe('Analytics RLS e2e', () => {
  const prisma = getTestPrisma();

  afterAll(() => closeTestApp());

  it('isolates metric daily and report jobs by tenant', async () => {
    const tenantAId = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const tenantA = await tx.tenant.create({
        data: { name: 'Analytics A', ownerName: 'a', contactPhone: '1' },
      });
      const tenantB = await tx.tenant.create({
        data: { name: 'Analytics B', ownerName: 'b', contactPhone: '2' },
      });
      const stationA = await tx.station.create({
        data: { tenantId: tenantA.id, name: 'A 店', code: `ANA${Date.now()}` },
      });
      const stationB = await tx.station.create({
        data: { tenantId: tenantB.id, name: 'B 店', code: `ANB${Date.now()}` },
      });
      await tx.metricDaily.create({
        data: {
          tenantId: tenantA.id,
          stationId: stationA.id,
          statDate: new Date('2026-06-18T00:00:00.000Z'),
          metric: 'inbound',
          value: BigInt(3),
        },
      });
      await tx.metricDaily.create({
        data: {
          tenantId: tenantB.id,
          stationId: stationB.id,
          statDate: new Date('2026-06-18T00:00:00.000Z'),
          metric: 'inbound',
          value: BigInt(9),
        },
      });
      await tx.reportJob.create({
        data: {
          tenantId: tenantA.id,
          stationId: stationA.id,
          type: 'DAILY_SUMMARY',
          format: 'CSV',
          status: 'DONE',
          rangeFrom: new Date('2026-06-01T00:00:00.000Z'),
          rangeTo: new Date('2026-06-18T00:00:00.000Z'),
          fileKey: 'mock://a.csv',
          createdBy: '00000000-0000-0000-0000-000000000001',
        },
      });
      await tx.reportJob.create({
        data: {
          tenantId: tenantB.id,
          stationId: stationB.id,
          type: 'DAILY_SUMMARY',
          format: 'CSV',
          status: 'PENDING',
          rangeFrom: new Date('2026-06-01T00:00:00.000Z'),
          rangeTo: new Date('2026-06-18T00:00:00.000Z'),
          createdBy: '00000000-0000-0000-0000-000000000002',
        },
      });
      return tenantA.id;
    });

    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'off', true)`,
      );
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.tenant_id', $1, true)`,
        tenantAId,
      );
      const metrics = await tx.metricDaily.findMany();
      const jobs = await tx.reportJob.findMany();
      return { metrics, jobs };
    });

    expect(rows.metrics).toHaveLength(1);
    expect(rows.metrics[0].tenantId).toBe(tenantAId);
    expect(rows.jobs).toHaveLength(1);
    expect(rows.jobs[0]).toMatchObject({
      tenantId: tenantAId,
      status: 'DONE',
      fileKey: 'mock://a.csv',
    });
  });
});
