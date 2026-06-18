import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Scheduled lock model migration', () => {
  it('creates platform scoped scheduled_locks with explicit RLS exception comment', () => {
    const migration = join(
      __dirname,
      '../prisma/migrations/20260618203000_scheduled_locks/migration.sql',
    );

    expect(existsSync(migration)).toBe(true);
    const sql = readFileSync(migration, 'utf8');

    expect(sql).toContain('CREATE TABLE "scheduled_locks"');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "scheduled_locks_name_key" ON "scheduled_locks"("name")',
    );
    expect(sql).toContain('平台级定时任务锁表，不含 tenant_id，显式 RLS 例外');
    expect(sql).not.toContain('ENABLE ROW LEVEL SECURITY');
  });
});
