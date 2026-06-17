import { PrismaService } from '../apps/api/src/core/prisma/prisma.service';

describe('Onboarding application model e2e', () => {
  const prisma = new PrismaService();

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  it('keeps tenant applications platform scoped with an explicit RLS exception', async () => {
    const applicationNo = `APP${Date.now()}-SCOPE`;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      await insertApplication(tx, {
        no: applicationNo,
        phone: `139${Date.now().toString().slice(-8)}`,
        status: 'PENDING',
      });
    });

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT application_no, status FROM tenant_applications WHERE application_no = '${applicationNo}'`,
    );
    expect(rows).toEqual([
      { application_no: applicationNo, status: 'PENDING' },
    ]);

    const table = await prisma.$queryRawUnsafe<any[]>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'tenant_applications'`,
    );
    expect(table[0]).toMatchObject({
      relrowsecurity: false,
      relforcerowsecurity: false,
    });

    const comment = await prisma.$queryRawUnsafe<any[]>(
      `SELECT obj_description('tenant_applications'::regclass, 'pg_class') AS comment`,
    );
    expect(comment[0].comment).toContain('platform-level');
    expect(comment[0].comment).toContain('does not use tenant RLS');
  });

  it('enforces application number uniqueness and one active pending application per phone', async () => {
    const suffix = Date.now();
    const phone = `138${suffix.toString().slice(-8)}`;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      await insertApplication(tx, {
        no: `APP${suffix}-PENDING`,
        phone,
        status: 'PENDING',
      });

      await expect(
        insertApplication(tx, {
          no: `APP${suffix}-PENDING-DUP`,
          phone,
          status: 'PENDING',
        }),
      ).rejects.toBeTruthy();

      await expect(
        insertApplication(tx, {
          no: `APP${suffix}-PENDING`,
          phone: `137${suffix.toString().slice(-8)}`,
          status: 'PENDING',
        }),
      ).rejects.toBeTruthy();
    });

    const rejectedPhone = `136${suffix.toString().slice(-8)}`;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      await insertApplication(tx, {
        no: `APP${suffix}-REJECTED`,
        phone: rejectedPhone,
        status: 'REJECTED',
      });
      await insertApplication(tx, {
        no: `APP${suffix}-REAPPLY`,
        phone: rejectedPhone,
        status: 'PENDING',
      });
    });

    const reapplied = await prisma.$queryRawUnsafe<any[]>(
      `SELECT status FROM tenant_applications WHERE contact_phone = '${rejectedPhone}' ORDER BY created_at`,
    );
    expect(reapplied.map((row) => row.status)).toEqual(['REJECTED', 'PENDING']);
  });

  it('seeds tenant review permission for platform operators', async () => {
    const permissions = await prisma.$queryRawUnsafe<any[]>(
      `SELECT code, module FROM "Permission" WHERE code = 'tenant:review'`,
    );
    expect(permissions).toEqual([{ code: 'tenant:review', module: 'tenant' }]);
  });

  async function insertApplication(
    tx: any,
    input: { no: string; phone: string; status: string },
  ) {
    await tx.$executeRawUnsafe(`
      INSERT INTO tenant_applications (
        id,
        application_no,
        status,
        entity_type,
        entity_name,
        unified_credit_code,
        region_code,
        contact_name,
        contact_phone,
        contact_email,
        station_name,
        station_address,
        proposed_plan_code,
        qualifications,
        reject_reason,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        '${input.no}',
        '${input.status}',
        'COMPANY',
        '测试主体',
        '91310000${input.no.slice(-8)}',
        '310000',
        '测试联系人',
        '${input.phone}',
        'apply@example.com',
        '测试驿站',
        '测试地址 1 号',
        'BASIC',
        '[{"type":"BUSINESS_LICENSE","fileKey":"onboarding/test/license.jpg","fileName":"license.jpg"}]'::jsonb,
        ${input.status === 'REJECTED' ? "'资料不完整'" : 'NULL'},
        now(),
        now()
      )
    `);
  }
});
