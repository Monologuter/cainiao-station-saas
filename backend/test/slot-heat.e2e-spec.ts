import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTestPrisma, closeTestApp } from './setup';

describe('Slot heat model e2e', () => {
  const prisma = getTestPrisma();

  afterAll(() => closeTestApp());
  const migration = join(
    __dirname,
    '../prisma/migrations/20260618230000_slot_heat_daily/migration.sql',
  );

  it('declares slot_heat_daily with RLS and FORCE', () => {
    expect(existsSync(migration)).toBe(true);
    const sql = readFileSync(migration, 'utf8');

    expect(sql).toContain('CREATE TABLE "slot_heat_daily"');
    expect(sql).toContain('"tenant_id" UUID NOT NULL');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY "slot_heat_daily_tenant_isolation"');
  });

  it('isolates slot heat rows by tenant', async () => {
    const tenantAId = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const tenantA = await tx.tenant.create({
        data: { name: 'Heat A', ownerName: 'a', contactPhone: '1' },
      });
      const tenantB = await tx.tenant.create({
        data: { name: 'Heat B', ownerName: 'b', contactPhone: '2' },
      });
      const stationA = await tx.station.create({
        data: { tenantId: tenantA.id, name: 'HA', code: `HA${Date.now()}` },
      });
      const stationB = await tx.station.create({
        data: { tenantId: tenantB.id, name: 'HB', code: `HB${Date.now()}` },
      });
      const shelfA = await tx.shelf.create({
        data: {
          tenantId: tenantA.id,
          stationId: stationA.id,
          code: 'A',
          name: 'A',
        },
      });
      const shelfB = await tx.shelf.create({
        data: {
          tenantId: tenantB.id,
          stationId: stationB.id,
          code: 'B',
          name: 'B',
        },
      });
      const slotA = await tx.slot.create({
        data: {
          tenantId: tenantA.id,
          stationId: stationA.id,
          shelfId: shelfA.id,
          code: 'A-01',
        },
      });
      const slotB = await tx.slot.create({
        data: {
          tenantId: tenantB.id,
          stationId: stationB.id,
          shelfId: shelfB.id,
          code: 'B-01',
        },
      });

      await tx.$executeRawUnsafe(
        `
          INSERT INTO slot_heat_daily
            (id, tenant_id, station_id, slot_id, stat_date, pick_count, store_count, avg_dwell_minutes, hour_histogram, created_at, updated_at)
          VALUES
            (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, '2026-06-18', 3, 0, 45, '[0,0,0,0,0,0,0,0,0,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb, now(), now()),
            (gen_random_uuid(), $4::uuid, $5::uuid, $6::uuid, '2026-06-18', 9, 0, 90, '[0,0,0,0,0,0,0,0,0,0,9,0,0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb, now(), now())
        `,
        tenantA.id,
        stationA.id,
        slotA.id,
        tenantB.id,
        stationB.id,
        slotB.id,
      );
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
      return tx.$queryRawUnsafe<
        Array<{ tenant_id: string; pick_count: number }>
      >(
        `SELECT tenant_id, pick_count FROM slot_heat_daily ORDER BY pick_count`,
      );
    });

    expect(rows).toEqual([{ tenant_id: tenantAId, pick_count: 3 }]);
  });
});
