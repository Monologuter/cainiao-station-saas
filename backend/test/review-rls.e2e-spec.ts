import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';

describe('Review RLS e2e', () => {
  const prisma = new PrismaService();

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('isolates reviews and complaints by tenant', async () => {
    const tenantAId = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const tenantA = await tx.tenant.create({
        data: { name: 'Review A', ownerName: 'a', contactPhone: '1' },
      });
      const tenantB = await tx.tenant.create({
        data: { name: 'Review B', ownerName: 'b', contactPhone: '2' },
      });
      const stationA = await tx.station.create({
        data: { tenantId: tenantA.id, name: 'A 店', code: `RA${Date.now()}` },
      });
      const stationB = await tx.station.create({
        data: { tenantId: tenantB.id, name: 'B 店', code: `RB${Date.now()}` },
      });
      const consumer = await tx.consumer.create({
        data: { phone: `137${Date.now().toString().slice(-8)}` },
      });
      const member = await tx.member.create({
        data: { consumerId: consumer.id, phone: consumer.phone },
      });
      await tx.review.create({
        data: {
          tenantId: tenantA.id,
          stationId: stationA.id,
          memberId: member.id,
          consumerPhone: consumer.phone,
          targetType: 'PICKUP',
          refType: 'parcel',
          refId: 'p-a',
          rating: 5,
        },
      });
      await tx.review.create({
        data: {
          tenantId: tenantB.id,
          stationId: stationB.id,
          memberId: member.id,
          consumerPhone: consumer.phone,
          targetType: 'PICKUP',
          refType: 'parcel',
          refId: 'p-b',
          rating: 1,
        },
      });
      await tx.complaint.create({
        data: {
          tenantId: tenantA.id,
          stationId: stationA.id,
          memberId: member.id,
          consumerPhone: consumer.phone,
          type: 'SERVICE',
          content: 'A complaint',
        },
      });
      await tx.complaint.create({
        data: {
          tenantId: tenantB.id,
          stationId: stationB.id,
          memberId: member.id,
          consumerPhone: consumer.phone,
          type: 'LOST',
          content: 'B complaint',
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
      const reviews = await tx.review.findMany();
      const complaints = await tx.complaint.findMany();
      return { reviews, complaints };
    });

    expect(rows.reviews).toHaveLength(1);
    expect(rows.reviews[0].tenantId).toBe(tenantAId);
    expect(rows.complaints).toHaveLength(1);
    expect(rows.complaints[0].tenantId).toBe(tenantAId);
  });
});
