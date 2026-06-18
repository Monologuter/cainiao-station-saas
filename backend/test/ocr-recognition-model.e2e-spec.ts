import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('OCR recognition model migration', () => {
  it('creates tenant-scoped ocr_recognitions with RLS and FORCE', () => {
    const migration = join(
      __dirname,
      '../prisma/migrations/20260618210000_ocr_recognitions/migration.sql',
    );

    expect(existsSync(migration)).toBe(true);
    const sql = readFileSync(migration, 'utf8');
    expect(sql).toContain('CREATE TYPE "OcrRecognitionStatus"');
    expect(sql).toContain('CREATE TABLE "ocr_recognitions"');
    expect(sql).toContain('"tenant_id" UUID NOT NULL');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY "ocr_recognitions_tenant_isolation"');
  });
});
