import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.bypass_rls', 'on', true)`,
    );

    const perms = [
      { code: 'tenant:create', name: '开店', module: 'tenant' },
      { code: 'tenant:read', name: '查看租户', module: 'tenant' },
    ];
    for (const perm of perms) {
      await tx.permission.upsert({
        where: { code: perm.code },
        update: {},
        create: perm,
      });
    }

    const superRole =
      (await tx.role.findFirst({
        where: { tenantId: null, code: '平台超管' },
      })) ??
      (await tx.role.create({
        data: {
          code: '平台超管',
          name: '平台超级管理员',
          scope: 'PLATFORM',
          isBuiltin: true,
        },
      }));

    const allPerms = await tx.permission.findMany();
    for (const perm of allPerms) {
      await tx.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: superRole.id,
            permissionId: perm.id,
          },
        },
        update: {},
        create: { roleId: superRole.id, permissionId: perm.id },
      });
    }

    const admin =
      (await tx.user.findFirst({
        where: { tenantId: null, username: 'admin' },
      })) ??
      (await tx.user.create({
        data: {
          type: 'PLATFORM',
          username: 'admin',
          passwordHash: await argon2.hash('admin123456'),
        },
      }));

    await tx.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: superRole.id } },
      update: {},
      create: { userId: admin.id, roleId: superRole.id },
    });
  });

  console.log('seed done: platform admin = admin / admin123456');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
