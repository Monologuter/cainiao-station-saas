import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';

describe('Station RLS 隔离', () => {
  const prisma = new PrismaService();

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('设置 app.tenant_id 后只能看到本租户的 shelves', async () => {
    const { tenantAId } = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );

      const tenantA = await tx.tenant.create({
        data: { name: 'Shelf A', ownerName: 'a', contactPhone: '1' },
      });
      const tenantB = await tx.tenant.create({
        data: { name: 'Shelf B', ownerName: 'b', contactPhone: '2' },
      });
      const stationA = await tx.station.create({
        data: { tenantId: tenantA.id, name: 'SA', code: `SA-${Date.now()}` },
      });
      const stationB = await tx.station.create({
        data: { tenantId: tenantB.id, name: 'SB', code: `SB-${Date.now()}` },
      });
      await tx.shelf.create({
        data: {
          tenantId: tenantA.id,
          stationId: stationA.id,
          code: 'A',
          name: 'A 架',
        },
      });
      await tx.shelf.create({
        data: {
          tenantId: tenantB.id,
          stationId: stationB.id,
          code: 'B',
          name: 'B 架',
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
      return tx.shelf.findMany();
    });

    expect(rows).toHaveLength(1);
    expect(rows.every((row) => row.tenantId === tenantAId)).toBe(true);
  });
});
