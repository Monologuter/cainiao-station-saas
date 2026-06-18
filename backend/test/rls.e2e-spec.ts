import { getTestPrisma, closeTestApp } from './setup';

describe('RLS 隔离', () => {
  const prisma = getTestPrisma();

  afterAll(() => closeTestApp());

  it('设置 app.tenant_id 后只能看到本租户的 Station', async () => {
    const { tenantAId } = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );

      const tenantA = await tx.tenant.create({
        data: { name: 'A', ownerName: 'a', contactPhone: '1' },
      });
      const tenantB = await tx.tenant.create({
        data: { name: 'B', ownerName: 'b', contactPhone: '2' },
      });
      await tx.station.create({
        data: { tenantId: tenantA.id, name: 'SA', code: `SA-${Date.now()}` },
      });
      await tx.station.create({
        data: { tenantId: tenantB.id, name: 'SB', code: `SB-${Date.now()}` },
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
      return tx.station.findMany();
    });

    expect(rows).toHaveLength(1);
    expect(rows.every((row) => row.tenantId === tenantAId)).toBe(true);
  });
});
