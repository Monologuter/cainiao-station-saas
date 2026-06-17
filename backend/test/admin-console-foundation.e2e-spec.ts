import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';

describe('Admin console foundation e2e', () => {
  const prisma = new PrismaService();

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('creates audit logs as tenant-aware append-only records with RLS forced', async () => {
    const columns = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'audit_logs'
        AND column_name IN (
          'tenant_id',
          'actor_id',
          'actor_type',
          'action',
          'resource_type',
          'resource_id',
          'result',
          'summary',
          'diff',
          'ip',
          'user_agent',
          'request_id',
          'created_at'
        )
      ORDER BY column_name
      `,
    );

    expect(columns.map((column) => column.column_name)).toEqual([
      'action',
      'actor_id',
      'actor_type',
      'created_at',
      'diff',
      'ip',
      'request_id',
      'resource_id',
      'resource_type',
      'result',
      'summary',
      'tenant_id',
      'user_agent',
    ]);
    expect(
      columns.find((column) => column.column_name === 'tenant_id'),
    ).toMatchObject({ is_nullable: 'YES' });
    expect(
      columns.find((column) => column.column_name === 'diff'),
    ).toMatchObject({ data_type: 'jsonb' });

    const table = await prisma.$queryRawUnsafe<any[]>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'audit_logs'`,
    );
    expect(table[0]).toMatchObject({
      relrowsecurity: true,
      relforcerowsecurity: true,
    });

    const policies = await prisma.$queryRawUnsafe<any[]>(
      `SELECT policyname FROM pg_policies WHERE tablename = 'audit_logs' ORDER BY policyname`,
    );
    expect(policies.map((policy) => policy.policyname)).toContain(
      'audit_logs_tenant_isolation',
    );
  });

  it('creates platform configuration tables with unique stable keys and explicit RLS exceptions', async () => {
    const expectedTables = [
      'channel_configs',
      'dict_items',
      'dictionaries',
      'system_configs',
    ];

    const tables = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, obj_description(c.oid, 'pg_class') AS comment
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname = 'public'
        AND c.relname IN ('dictionaries', 'dict_items', 'system_configs', 'channel_configs')
      ORDER BY c.relname
      `,
    );

    expect(tables.map((table) => table.relname)).toEqual(expectedTables);
    for (const table of tables) {
      expect(table).toMatchObject({
        relrowsecurity: false,
        relforcerowsecurity: false,
      });
      expect(table.comment).toContain('platform-level');
      expect(table.comment).toContain('does not use tenant RLS');
    }

    const indexes = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT indexname
      FROM pg_indexes
      WHERE tablename IN ('dictionaries', 'dict_items', 'system_configs', 'channel_configs')
      ORDER BY indexname
      `,
    );
    expect(indexes.map((index) => index.indexname)).toEqual(
      expect.arrayContaining([
        'channel_configs_channel_key',
        'dict_items_dictionary_id_code_key',
        'dictionaries_type_key',
        'system_configs_config_key_key',
      ]),
    );
  });

  it('seeds platform admin console permissions and default dictionaries/channels', async () => {
    const permissions = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT code, module
      FROM "Permission"
      WHERE code IN ('monitor:view', 'audit:view', 'config:view', 'config:manage')
      ORDER BY code
      `,
    );
    expect(permissions).toEqual([
      { code: 'audit:view', module: 'audit' },
      { code: 'config:manage', module: 'config' },
      { code: 'config:view', module: 'config' },
      { code: 'monitor:view', module: 'monitor' },
    ]);

    const dictionaries = await prisma.$queryRawUnsafe<any[]>(
      `SELECT type FROM dictionaries ORDER BY type`,
    );
    expect(dictionaries.map((dictionary) => dictionary.type)).toEqual(
      expect.arrayContaining([
        'courier_company',
        'exception_type',
        'notify_scene',
        'parcel_size',
      ]),
    );

    const channels = await prisma.$queryRawUnsafe<any[]>(
      `SELECT channel, provider, enabled, fallback_provider FROM channel_configs ORDER BY channel`,
    );
    expect(channels).toEqual(
      expect.arrayContaining([
        {
          channel: 'logistics',
          provider: 'mock',
          enabled: true,
          fallback_provider: 'mock',
        },
        {
          channel: 'pay',
          provider: 'mock',
          enabled: true,
          fallback_provider: 'mock',
        },
        {
          channel: 'sms',
          provider: 'mock',
          enabled: true,
          fallback_provider: 'mock',
        },
      ]),
    );
  });
});
