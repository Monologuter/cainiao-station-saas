import { getTestPrisma, closeTestApp } from './setup';

describe('Station RLS 隔离', () => {
  const prisma = getTestPrisma();

  afterAll(() => closeTestApp());

  it('设置 app.tenant_id 后只能看到本租户的 shelves', async () => {
    const { tenantAId } = await prisma.$transaction<any>(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );

      const tenantA = await tx.tenant.create({
        data: { name: 'Shelf A', ownerName: 'a', contactPhone: '1' },
      });
      const tenantB = await tx.tenant.create({
        data: { name: 'Shelf B', ownerName: 'b', contactPhone: '2' },
      });
      const stationA = await tx.station.create({
        data: { tenantId: tenantA.id, name: 'SA', code: `SA-${Date.now()}` },
      });
      const stationB = await tx.station.create({
        data: { tenantId: tenantB.id, name: 'SB', code: `SB-${Date.now()}` },
      });
      await tx.shelf.create({
        data: {
          tenantId: tenantA.id,
          stationId: stationA.id,
          code: 'A',
          name: 'A 架',
        },
      });
      await tx.shelf.create({
        data: {
          tenantId: tenantB.id,
          stationId: stationB.id,
          code: 'B',
          name: 'B 架',
        },
      });

      return { tenantAId: tenantA.id };
    });

    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'off', true)`,
      );
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.tenant_id', $1, true)`,
        tenantAId,
      );
      return tx.shelf.findMany();
    });

    expect(rows).toHaveLength(1);
    expect(rows.every((row) => row.tenantId === tenantAId)).toBe(true);
  });

  it('设置 app.tenant_id 后只能看到本租户的 pickup_authorizations', async () => {
    const { tenantAId } = await prisma.$transaction<any>(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );

      const tenantA = await tx.tenant.create({
        data: { name: 'Auth A', ownerName: 'a', contactPhone: '1' },
      });
      const tenantB = await tx.tenant.create({
        data: { name: 'Auth B', ownerName: 'b', contactPhone: '2' },
      });
      await tx.pickupAuthorization.create({
        data: {
          tenantId: tenantA.id,
          ownerPhone: '13800000000',
          authorizedPhone: '13900000000',
        },
      });
      await tx.pickupAuthorization.create({
        data: {
          tenantId: tenantB.id,
          ownerPhone: '13700000000',
          authorizedPhone: '13600000000',
        },
      });

      return { tenantAId: tenantA.id };
    });

    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'off', true)`,
      );
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.tenant_id', $1, true)`,
        tenantAId,
      );
      return tx.pickupAuthorization.findMany();
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBe(tenantAId);
  });

  it('设置 app.tenant_id 后只能看到本租户的 RBAC 与门店分配数据', async () => {
    const { tenantAId } = await prisma.$transaction<any>(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );

      const tenantA = await tx.tenant.create({
        data: { name: 'RBAC A', ownerName: 'a', contactPhone: '11' },
      });
      const tenantB = await tx.tenant.create({
        data: { name: 'RBAC B', ownerName: 'b', contactPhone: '22' },
      });
      const stationA = await tx.station.create({
        data: { tenantId: tenantA.id, name: 'RSA', code: `RSA-${Date.now()}` },
      });
      const stationB = await tx.station.create({
        data: { tenantId: tenantB.id, name: 'RSB', code: `RSB-${Date.now()}` },
      });
      const userA = await tx.user.create({
        data: {
          tenantId: tenantA.id,
          type: 'STAFF',
          username: `a-${Date.now()}`,
          passwordHash: 'hash',
        },
      });
      const userB = await tx.user.create({
        data: {
          tenantId: tenantB.id,
          type: 'STAFF',
          username: `b-${Date.now()}`,
          passwordHash: 'hash',
        },
      });
      const roleA = await tx.role.create({
        data: {
          tenantId: tenantA.id,
          code: `ra-${Date.now()}`,
          name: 'A',
          scope: 'TENANT',
        },
      });
      const roleB = await tx.role.create({
        data: {
          tenantId: tenantB.id,
          code: `rb-${Date.now()}`,
          name: 'B',
          scope: 'TENANT',
        },
      });
      const permission = await tx.permission.upsert({
        where: { code: 'rls:test' },
        update: {},
        create: { code: 'rls:test', name: 'RLS Test', module: 'test' },
      });
      await tx.userRole.create({
        data: { userId: userA.id, roleId: roleA.id },
      });
      await tx.userRole.create({
        data: { userId: userB.id, roleId: roleB.id },
      });
      await tx.rolePermission.create({
        data: { roleId: roleA.id, permissionId: permission.id },
      });
      await tx.rolePermission.create({
        data: { roleId: roleB.id, permissionId: permission.id },
      });
      await tx.staffStation.create({
        data: {
          tenantId: tenantA.id,
          userId: userA.id,
          stationId: stationA.id,
        },
      });
      await tx.staffStation.create({
        data: {
          tenantId: tenantB.id,
          userId: userB.id,
          stationId: stationB.id,
        },
      });

      return { tenantAId: tenantA.id };
    });

    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'off', true)`,
      );
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.tenant_id', $1, true)`,
        tenantAId,
      );
      return {
        roles: await tx.role.findMany(),
        userRoles: await tx.userRole.findMany(),
        rolePermissions: await tx.rolePermission.findMany(),
        staffStations: await tx.staffStation.findMany(),
      };
    });

    expect(rows.roles).toHaveLength(1);
    expect(rows.roles[0].tenantId).toBe(tenantAId);
    expect(rows.userRoles).toHaveLength(1);
    expect(rows.rolePermissions).toHaveLength(1);
    expect(rows.staffStations).toHaveLength(1);
    expect(rows.staffStations[0].tenantId).toBe(tenantAId);
  });

  it('WITH CHECK rejects writes with a tenant_id outside the current tenant', async () => {
    const { tenantAId, tenantBId, stationBId } = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.bypass_rls', 'on', true)`,
        );
        const tenantA = await tx.tenant.create({
          data: { name: 'Check A', ownerName: 'a', contactPhone: '111' },
        });
        const tenantB = await tx.tenant.create({
          data: { name: 'Check B', ownerName: 'b', contactPhone: '222' },
        });
        const stationB = await tx.station.create({
          data: {
            tenantId: tenantB.id,
            name: 'Check B Station',
            code: `CB-${Date.now()}`,
          },
        });
        return {
          tenantAId: tenantA.id,
          tenantBId: tenantB.id,
          stationBId: stationB.id,
        };
      },
    );

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.bypass_rls', 'off', true)`,
        );
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.tenant_id', $1, true)`,
          tenantAId,
        );
        return tx.parcel.create({
          data: {
            tenantId: tenantBId,
            stationId: stationBId,
            waybillNo: `CHECK-${Date.now()}`,
            receiverPhone: '13800000000',
            receiverPhoneTail: '0000',
          },
        });
      }),
    ).rejects.toThrow(/row-level security|violates/);
  });
});
