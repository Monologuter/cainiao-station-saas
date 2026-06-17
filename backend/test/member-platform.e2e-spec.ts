import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';

describe('Member platform tables e2e', () => {
  const prisma = new PrismaService();

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('creates consumer, member and point records without tenant RLS context', async () => {
    const phone = `135${Date.now().toString().slice(-8)}`;

    const out = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'off', true)`,
      );
      const consumer = await tx.consumer.create({ data: { phone } });
      const member = await tx.member.create({
        data: { consumerId: consumer.id, phone },
      });
      const point = await tx.pointRecord.create({
        data: {
          memberId: member.id,
          change: 2,
          balanceAfter: 2,
          type: 'PICKUP',
          refType: 'parcel',
          refId: 'p1',
          idempotencyKey: `pickup:p1:${Date.now()}`,
        },
      });
      return { consumer, member, point };
    });

    expect(out.member).toMatchObject({
      consumerId: out.consumer.id,
      phone,
      level: 0,
      totalPoints: 0,
      availablePoints: 0,
      frozenPoints: 0,
      continuousCheckinDays: 0,
    });
    expect(out.point.balanceAfter).toBe(2);
  });
});
