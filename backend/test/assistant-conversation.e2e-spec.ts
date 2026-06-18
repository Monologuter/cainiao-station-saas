import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTestPrisma, closeTestApp } from './setup';

describe('Assistant conversation model', () => {
  const prisma = getTestPrisma();

  afterAll(() => closeTestApp());
  const migration = join(
    __dirname,
    '../prisma/migrations/20260618223000_assistant_conversations/migration.sql',
  );

  it('declares tenant-scoped conversations and messages with RLS', () => {
    expect(existsSync(migration)).toBe(true);
    const sql = readFileSync(migration, 'utf8');

    expect(sql).toContain('CREATE TABLE "ai_conversations"');
    expect(sql).toContain('CREATE TABLE "ai_messages"');
    expect(sql).toContain('"tenant_id" UUID NOT NULL');
    expect(sql).toContain(
      'ALTER TABLE "ai_conversations" FORCE ROW LEVEL SECURITY',
    );
    expect(sql).toContain('ALTER TABLE "ai_messages" FORCE ROW LEVEL SECURITY');
  });

  it('isolates conversations and messages by tenant at database level', async () => {
    const suffix = Date.now().toString();
    const tenantAId = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const tenantA = await tx.tenant.create({
        data: {
          name: 'AI Conv A',
          ownerName: 'a',
          contactPhone: `aic-a-${Date.now()}`,
        },
      });
      const tenantB = await tx.tenant.create({
        data: {
          name: 'AI Conv B',
          ownerName: 'b',
          contactPhone: `aic-b-${Date.now()}`,
        },
      });
      const consumerA = await tx.consumer.create({
        data: { phone: `139${Date.now().toString().slice(-8)}` },
      });
      const consumerB = await tx.consumer.create({
        data: { phone: `138${Date.now().toString().slice(-8)}` },
      });

      await tx.$executeRawUnsafe(
        `
          INSERT INTO ai_conversations
            (id, tenant_id, consumer_id, actor_type, channel, mode, title, status, last_active_at, created_at, updated_at)
          VALUES
            (gen_random_uuid(), $1::uuid, $3::uuid, 'CONSUMER', 'USER_APP', 'MOCK', 'A 会话 ${suffix}', 'ACTIVE', now(), now(), now()),
            (gen_random_uuid(), $2::uuid, $4::uuid, 'CONSUMER', 'USER_APP', 'MOCK', 'B 会话 ${suffix}', 'ACTIVE', now(), now(), now())
        `,
        tenantA.id,
        tenantB.id,
        consumerA.id,
        consumerB.id,
      );
      await tx.$executeRawUnsafe(
        `
          INSERT INTO ai_messages
            (id, tenant_id, conversation_id, role, content, degraded, seq, created_at)
          SELECT gen_random_uuid(), tenant_id, id, 'USER', title, false, 1, now()
          FROM ai_conversations
          WHERE title IN ('A 会话 ${suffix}', 'B 会话 ${suffix}')
        `,
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
      const conversations = await tx.$queryRawUnsafe<Array<{ title: string }>>(
        `SELECT title FROM ai_conversations WHERE title LIKE $1 ORDER BY title`,
        `%${suffix}`,
      );
      const messages = await tx.$queryRawUnsafe<Array<{ content: string }>>(
        `SELECT content FROM ai_messages WHERE content LIKE $1 ORDER BY content`,
        `%${suffix}`,
      );
      return { conversations, messages };
    });

    expect(rows.conversations.map((row) => row.title)).toEqual([
      `A 会话 ${suffix}`,
    ]);
    expect(rows.messages.map((row) => row.content)).toEqual([
      `A 会话 ${suffix}`,
    ]);
  });
});
