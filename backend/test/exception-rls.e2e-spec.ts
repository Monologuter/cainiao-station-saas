import { getTestPrisma, closeTestApp } from './setup';

describe('Exception RLS 隔离', () => {
  const prisma = getTestPrisma();

  afterAll(() => closeTestApp());

  it('设置 app.tenant_id 后只能看到本租户的 exception tickets', async () => {
    const { tenantAId } = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );

      const tenantA = await tx.tenant.create({
        data: { name: 'Exception A', ownerName: 'a', contactPhone: '1' },
      });
      const tenantB = await tx.tenant.create({
        data: { name: 'Exception B', ownerName: 'b', contactPhone: '2' },
      });
      const stationA = await tx.station.create({
        data: { tenantId: tenantA.id, name: 'EA', code: `EA-${Date.now()}` },
      });
      const stationB = await tx.station.create({
        data: { tenantId: tenantB.id, name: 'EB', code: `EB-${Date.now()}` },
      });
      await tx.exceptionTicket.create({
        data: {
          tenantId: tenantA.id,
          stationId: stationA.id,
          code: `EX-A-${Date.now()}`,
          type: 'DAMAGED',
          description: 'A broken parcel',
        },
      });
      await tx.exceptionTicket.create({
        data: {
          tenantId: tenantB.id,
          stationId: stationB.id,
          code: `EX-B-${Date.now()}`,
          type: 'MISDELIVERED',
          description: 'B wrong parcel',
        },
      });

      return { tenantAId: tenantA.id };
    });

    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'off', true)`,
      );
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.tenant_id', $1, true)`,
        tenantAId,
      );
      return tx.exceptionTicket.findMany();
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBe(tenantAId);
  });
});
