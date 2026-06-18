import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTestPrisma, closeTestApp } from './setup';

describe('Assistant FAQ knowledge base model', () => {
  const prisma = getTestPrisma();

  afterAll(() => closeTestApp());
  const migration = join(
    __dirname,
    '../prisma/migrations/20260618220000_assistant_faq_entries/migration.sql',
  );

  it('declares faq_entries with platform or tenant scope and RLS', () => {
    expect(existsSync(migration)).toBe(true);
    const sql = readFileSync(migration, 'utf8');

    expect(sql).toContain('CREATE TYPE "FaqCategory"');
    expect(sql).toContain('CREATE TABLE "faq_entries"');
    expect(sql).toContain('"tenant_id" UUID');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).toContain(
      'CREATE POLICY "faq_entries_tenant_or_platform_read"',
    );
    expect(sql).toContain('"tenant_id" IS NULL');
  });

  it('seeds default FAQ entries for assistant fallback coverage', () => {
    const seed = readFileSync(join(__dirname, '../prisma/seed.ts'), 'utf8');

    expect(seed).toContain('defaultFaqEntries');
    for (const category of [
      'PICKUP',
      'SHIPPING',
      'PARCEL_STATUS',
      'MEMBER',
      'GENERAL',
    ]) {
      expect(seed).toContain(`category: '${category}'`);
    }
  });

  it('lets tenants read platform FAQ and their own FAQ only', async () => {
    const suffix = Date.now().toString();
    const tenantAId = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const tenantA = await tx.tenant.create({
        data: {
          name: 'FAQ A',
          ownerName: 'a',
          contactPhone: `faq-a-${Date.now()}`,
        },
      });
      const tenantB = await tx.tenant.create({
        data: {
          name: 'FAQ B',
          ownerName: 'b',
          contactPhone: `faq-b-${Date.now()}`,
        },
      });

      await tx.$executeRawUnsafe(
        `
          INSERT INTO faq_entries
            (id, tenant_id, category, question, answer, keywords, priority, enabled, source, created_at, updated_at)
          VALUES
            (gen_random_uuid(), NULL, 'GENERAL', '平台 FAQ ${suffix}', '平台通用答案', ARRAY['平台','通用'], 10, true, 'test', now(), now()),
            (gen_random_uuid(), $1::uuid, 'PICKUP', 'A FAQ ${suffix}', 'A 租户答案', ARRAY['A'], 20, true, 'test', now(), now()),
            (gen_random_uuid(), $2::uuid, 'PICKUP', 'B FAQ ${suffix}', 'B 租户答案', ARRAY['B'], 30, true, 'test', now(), now())
        `,
        tenantA.id,
        tenantB.id,
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
      return tx.$queryRawUnsafe<Array<{ question: string }>>(
        `SELECT question FROM faq_entries WHERE source = 'test' AND question LIKE $1 ORDER BY priority`,
        `%${suffix}`,
      );
    });

    expect(rows.map((row) => row.question)).toEqual([
      `平台 FAQ ${suffix}`,
      `A FAQ ${suffix}`,
    ]);
  });
});
