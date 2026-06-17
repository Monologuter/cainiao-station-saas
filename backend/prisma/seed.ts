import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const shippingPerms = [
  { code: 'shipping:quote', name: '寄件报价', module: 'shipping' },
  { code: 'shipping:create', name: '创建寄件单', module: 'shipping' },
  { code: 'shipping:read', name: '查看寄件单', module: 'shipping' },
  { code: 'shipping:pay', name: '寄件支付', module: 'shipping' },
  { code: 'shipping:collect', name: '寄件揽收', module: 'shipping' },
  { code: 'shipping:cancel', name: '取消寄件单', module: 'shipping' },
];

const exceptionPerms = [
  { code: 'exception:create', name: '标记异常件', module: 'exception' },
  { code: 'exception:read', name: '查看异常件', module: 'exception' },
  { code: 'exception:handle', name: '处理异常件', module: 'exception' },
  { code: 'parcel:overdue:scan', name: '手动滞留扫描', module: 'parcel' },
];

const memberReviewPerms = [
  { code: 'review:read', name: '查看评价', module: 'review' },
  { code: 'review:reply', name: '回复评价', module: 'review' },
  { code: 'review:manage', name: '管理评价', module: 'review' },
  { code: 'complaint:read', name: '查看投诉', module: 'review' },
  { code: 'complaint:handle', name: '处理投诉', module: 'review' },
  { code: 'coupon:manage', name: '管理优惠券', module: 'member' },
  { code: 'coupon:issue', name: '发放优惠券', module: 'member' },
];

const analyticsPerms = [
  { code: 'analytics:read', name: '查看运营大屏', module: 'analytics' },
  { code: 'analytics:export', name: '导出运营报表', module: 'analytics' },
  { code: 'analytics:reconcile', name: '手动对账重算', module: 'analytics' },
  {
    code: 'analytics:platform:read',
    name: '查看平台运营总览',
    module: 'analytics',
  },
];

const defaultPriceRules = [
  ['SF', '顺丰速运', 900, 500, 12],
  ['YTO', '圆通速递', 600, 300, 48],
  ['ZTO', '中通快递', 650, 280, 36],
  ['STO', '申通快递', 580, 260, 60],
] as const;

const zones = [
  ['SAME_CITY', 1.0],
  ['SAME_PROVINCE', 1.1],
  ['CROSS_PROVINCE', 1.3],
  ['REMOTE', 1.6],
] as const;

async function main() {
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );

      const perms = [
        { code: 'tenant:create', name: '开店', module: 'tenant' },
        { code: 'tenant:read', name: '查看租户', module: 'tenant' },
        { code: 'station:manage', name: '货架库位管理', module: 'station' },
        { code: 'station:read', name: '查看门店货架库位', module: 'station' },
        { code: 'parcel:inbound', name: '入库', module: 'parcel' },
        { code: 'parcel:pickup', name: '取件核销', module: 'parcel' },
        { code: 'parcel:read', name: '查看包裹通知', module: 'parcel' },
        ...shippingPerms,
        ...exceptionPerms,
        ...memberReviewPerms,
        ...analyticsPerms,
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

      for (const template of [
        {
          code: 'PARCEL_STORED',
          channel: 'IN_APP' as const,
          content: '您的包裹已到{station}，取件码{code}，库位{slot}。',
        },
        {
          code: 'PARCEL_STORED',
          channel: 'SMS' as const,
          content:
            '【菜鸟驿站】您的包裹已到{station}，取件码{code}，库位{slot}。',
        },
        {
          code: 'OVERDUE_REMIND',
          channel: 'IN_APP' as const,
          content:
            '您的包裹已在{station}滞留{daysOverdue}天，请凭取件码{code}尽快领取。',
        },
        {
          code: 'OVERDUE_REMIND',
          channel: 'SMS' as const,
          content:
            '【菜鸟驿站】您的包裹已滞留{daysOverdue}天，请尽快到{station}领取。',
        },
        {
          code: 'OVERDUE_URGE',
          channel: 'IN_APP' as const,
          content:
            '您的包裹已滞留{daysOverdue}天，库位{slot}，请尽快领取避免退回。',
        },
        {
          code: 'OVERDUE_URGE',
          channel: 'SMS' as const,
          content:
            '【菜鸟驿站】您的包裹已滞留{daysOverdue}天，请尽快领取，逾期可能退回。',
        },
        {
          code: 'OVERDUE_FINAL',
          channel: 'IN_APP' as const,
          content:
            '您的包裹已滞留{daysOverdue}天，即将按规则退回，请立即领取。',
        },
        {
          code: 'OVERDUE_FINAL',
          channel: 'SMS' as const,
          content:
            '【菜鸟驿站】您的包裹已滞留{daysOverdue}天，即将退回，请立即领取。',
        },
      ]) {
        const exists = await tx.notifyTemplate.findFirst({
          where: {
            tenantId: null,
            code: template.code,
            channel: template.channel,
          },
        });
        if (!exists) {
          await tx.notifyTemplate.create({ data: template });
        }
      }

      const tenantDailyPerms = await tx.permission.findMany({
        where: {
          code: {
            in: [
              'station:manage',
              'station:read',
              'parcel:inbound',
              'parcel:pickup',
              'parcel:read',
              ...shippingPerms.map((permission) => permission.code),
              ...exceptionPerms.map((permission) => permission.code),
              ...memberReviewPerms.map((permission) => permission.code),
              'analytics:read',
              'analytics:export',
            ],
          },
        },
      });
      const bossRoles = await tx.role.findMany({
        where: { tenantId: { not: null }, code: '店长' },
      });
      for (const role of bossRoles) {
        for (const perm of tenantDailyPerms) {
          await tx.rolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: role.id,
                permissionId: perm.id,
              },
            },
            update: {},
            create: { roleId: role.id, permissionId: perm.id },
          });
        }
      }

      const tenants = await tx.tenant.findMany({ select: { id: true } });
      for (const tenant of tenants) {
        const hasAnyRule = await tx.priceRule.findFirst({
          where: { tenantId: tenant.id },
        });
        if (hasAnyRule) {
          continue;
        }
        await tx.priceRule.createMany({
          data: defaultPriceRules.flatMap(
            ([courierCode, courierName, firstPrice, addPrice, estHours]) =>
              zones.map(([zone, zoneFactor]) => ({
                tenantId: tenant.id,
                courierCode,
                courierName,
                zone,
                firstWeightGram: 1000,
                firstPrice,
                addUnitGram: 1000,
                addPrice,
                zoneFactor,
                estHours,
                enabled: true,
                priority: 0,
              })),
          ),
        });
      }
    },
    { timeout: 30000 },
  );

  console.log('seed done: platform admin = admin / admin123456');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
