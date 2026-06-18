import { getTestPrisma, closeTestApp } from './setup';

describe('Billing RLS e2e', () => {
  const prisma = getTestPrisma();

  afterAll(() => closeTestApp());

  it('isolates subscriptions, invoices, usage records and usage dedup by tenant', async () => {
    const { tenantAId, subscriptionAId } = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.bypass_rls', 'on', true)`,
        );
        const tenantA = await tx.tenant.create({
          data: { name: 'Billing A', ownerName: 'a', contactPhone: '1' },
        });
        const tenantB = await tx.tenant.create({
          data: { name: 'Billing B', ownerName: 'b', contactPhone: '2' },
        });
        const stationA = await tx.station.create({
          data: {
            tenantId: tenantA.id,
            name: 'A 店',
            code: `BLA${Date.now()}`,
          },
        });
        const stationB = await tx.station.create({
          data: {
            tenantId: tenantB.id,
            name: 'B 店',
            code: `BLB${Date.now()}`,
          },
        });
        const plan = await tx.billingPlan.create({
          data: {
            code: `BASIC-${Date.now()}`,
            name: '基础版',
            monthlyPrice: BigInt(9900),
            quotas: { sms: 100, parcels: -1, stations: 1 },
            overagePrices: { sms: 10, parcels: 0, stations: 19900 },
            status: 'ACTIVE',
          },
        });
        const subscriptionA = await tx.subscription.create({
          data: subscriptionData(tenantA.id, stationA.id, plan.id),
        });
        const subscriptionB = await tx.subscription.create({
          data: subscriptionData(tenantB.id, stationB.id, plan.id),
        });
        await tx.usageRecord.create({
          data: {
            tenantId: tenantA.id,
            subscriptionId: subscriptionA.id,
            periodStart: new Date('2026-06-01T00:00:00.000Z'),
            metric: 'SMS',
            quantity: BigInt(3),
          },
        });
        await tx.usageRecord.create({
          data: {
            tenantId: tenantB.id,
            subscriptionId: subscriptionB.id,
            periodStart: new Date('2026-06-01T00:00:00.000Z'),
            metric: 'SMS',
            quantity: BigInt(9),
          },
        });
        await tx.usageDedup.create({
          data: {
            tenantId: tenantA.id,
            eventId: 'evt-a',
            subscriptionId: subscriptionA.id,
            metric: 'SMS',
          },
        });
        await tx.usageDedup.create({
          data: {
            tenantId: tenantB.id,
            eventId: 'evt-b',
            subscriptionId: subscriptionB.id,
            metric: 'SMS',
          },
        });
        await tx.invoice.create({
          data: invoiceData(tenantA.id, subscriptionA.id, 'INV-A'),
        });
        await tx.invoice.create({
          data: invoiceData(tenantB.id, subscriptionB.id, 'INV-B'),
        });

        return { tenantAId: tenantA.id, subscriptionAId: subscriptionA.id };
      },
    );

    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'off', true)`,
      );
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.tenant_id', $1, true)`,
        tenantAId,
      );
      return {
        subscriptions: await tx.subscription.findMany(),
        usages: await tx.usageRecord.findMany(),
        dedup: await tx.usageDedup.findMany(),
        invoices: await tx.invoice.findMany(),
      };
    });

    expect(rows.subscriptions).toHaveLength(1);
    expect(rows.subscriptions[0].id).toBe(subscriptionAId);
    expect(rows.usages).toHaveLength(1);
    expect(rows.usages[0].tenantId).toBe(tenantAId);
    expect(rows.dedup).toHaveLength(1);
    expect(rows.dedup[0].eventId).toBe('evt-a');
    expect(rows.invoices).toHaveLength(1);
    expect(rows.invoices[0]).toMatchObject({
      tenantId: tenantAId,
      code: 'INV-A',
    });
  });

  it('keeps billing plans platform scoped and enforces one active subscription per station', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.bypass_rls', 'on', true)`,
        );
        const tenant = await tx.tenant.create({
          data: { name: 'Billing Unique', ownerName: 'u', contactPhone: '3' },
        });
        const station = await tx.station.create({
          data: { tenantId: tenant.id, name: 'U 店', code: `BLU${Date.now()}` },
        });
        const plan = await tx.billingPlan.create({
          data: {
            code: `UNIQUE-${Date.now()}`,
            name: '唯一约束版',
            monthlyPrice: BigInt(19900),
            quotas: { sms: 100, parcels: 1000, stations: 1 },
            overagePrices: { sms: 8, parcels: 1, stations: 29900 },
            status: 'ACTIVE',
          },
        });
        await tx.subscription.create({
          data: subscriptionData(tenant.id, station.id, plan.id),
        });
        await tx.subscription.create({
          data: subscriptionData(tenant.id, station.id, plan.id),
        });
      }),
    ).rejects.toBeTruthy();

    const activePlans = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'off', true)`,
      );
      return tx.billingPlan.findMany({ where: { status: 'ACTIVE' } });
    });
    expect(activePlans.length).toBeGreaterThan(0);
  });

  function subscriptionData(
    tenantId: string,
    stationId: string,
    planId: string,
  ) {
    return {
      tenantId,
      stationId,
      planId,
      currentPeriodStart: new Date('2026-06-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      nextBillingAt: new Date('2026-07-01T00:00:00.000Z'),
      startedAt: new Date('2026-06-01T00:00:00.000Z'),
      planSnapshot: {
        monthlyPrice: 9900,
        quotas: { sms: 100, parcels: -1, stations: 1 },
        overagePrices: { sms: 10, parcels: 0, stations: 19900 },
      },
    };
  }

  function invoiceData(tenantId: string, subscriptionId: string, code: string) {
    return {
      tenantId,
      subscriptionId,
      code,
      periodStart: new Date('2026-06-01T00:00:00.000Z'),
      periodEnd: new Date('2026-07-01T00:00:00.000Z'),
      status: 'OPEN' as const,
      baseAmount: BigInt(9900),
      overageAmount: BigInt(0),
      totalAmount: BigInt(9900),
      lineItems: [{ type: 'BASE', amount: 9900 }],
      issuedAt: new Date('2026-07-01T00:00:00.000Z'),
      dueAt: new Date('2026-07-08T00:00:00.000Z'),
    };
  }
});
