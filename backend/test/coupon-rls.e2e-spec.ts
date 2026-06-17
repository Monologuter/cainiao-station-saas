import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';

describe('Coupon RLS e2e', () => {
  const prisma = new PrismaService();

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('isolates coupon templates and coupons by tenant', async () => {
    const { tenantAId } = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const tenantA = await tx.tenant.create({
        data: { name: 'Coupon A', ownerName: 'a', contactPhone: '1' },
      });
      const tenantB = await tx.tenant.create({
        data: { name: 'Coupon B', ownerName: 'b', contactPhone: '2' },
      });
      const consumer = await tx.consumer.create({
        data: { phone: `136${Date.now().toString().slice(-8)}` },
      });
      const member = await tx.member.create({
        data: { consumerId: consumer.id, phone: consumer.phone },
      });
      const templateA = await tx.couponTemplate.create({
        data: {
          tenantId: tenantA.id,
          name: 'A 券',
          type: 'DISCOUNT',
          faceValue: 5,
          threshold: 20,
          scene: 'ALL',
          validDays: 7,
        },
      });
      const templateB = await tx.couponTemplate.create({
        data: {
          tenantId: tenantB.id,
          name: 'B 券',
          type: 'DISCOUNT',
          faceValue: 5,
          threshold: 20,
          scene: 'ALL',
          validDays: 7,
        },
      });
      await tx.coupon.create({
        data: {
          tenantId: tenantA.id,
          templateId: templateA.id,
          memberId: member.id,
          code: `CA${Date.now()}`,
          obtainedVia: 'ISSUE',
          expireAt: new Date(Date.now() + 86400000),
        },
      });
      await tx.coupon.create({
        data: {
          tenantId: tenantB.id,
          templateId: templateB.id,
          memberId: member.id,
          code: `CB${Date.now()}`,
          obtainedVia: 'ISSUE',
          expireAt: new Date(Date.now() + 86400000),
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
      const templates = await tx.couponTemplate.findMany();
      const coupons = await tx.coupon.findMany();
      return { templates, coupons };
    });

    expect(rows.templates).toHaveLength(1);
    expect(rows.templates[0].tenantId).toBe(tenantAId);
    expect(rows.coupons).toHaveLength(1);
    expect(rows.coupons[0].tenantId).toBe(tenantAId);
  });
});
