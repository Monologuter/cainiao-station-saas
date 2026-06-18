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

const billingPerms = [
  { code: 'plan:read', name: '查看套餐', module: 'billing' },
  { code: 'plan:write', name: '管理套餐', module: 'billing' },
  { code: 'subscription:read', name: '查看订阅', module: 'billing' },
  { code: 'subscription:write', name: '管理订阅', module: 'billing' },
  { code: 'subscription:admin', name: '平台订阅管理', module: 'billing' },
  { code: 'usage:read', name: '查看用量', module: 'billing' },
  { code: 'usage:meter', name: '上报用量', module: 'billing' },
  { code: 'invoice:read', name: '查看账单', module: 'billing' },
  { code: 'invoice:pay', name: '支付账单', module: 'billing' },
  { code: 'invoice:run', name: '手动出账', module: 'billing' },
  { code: 'invoice:admin', name: '平台账单管理', module: 'billing' },
];

const adminConsolePerms = [
  { code: 'monitor:view', name: '查看平台监控', module: 'monitor' },
  { code: 'audit:view', name: '查看操作审计', module: 'audit' },
  { code: 'config:view', name: '查看系统配置', module: 'config' },
  { code: 'config:manage', name: '管理系统配置', module: 'config' },
];

const defaultBillingPlans = [
  {
    code: 'BASIC',
    name: '基础版',
    monthlyPrice: 9900,
    quotas: { sms: 300, parcels: -1, stations: 1 },
    overagePrices: { sms: 10, parcels: 0, stations: 19900 },
    sort: 10,
    description: '适合单店起步运营',
  },
  {
    code: 'STANDARD',
    name: '标准版',
    monthlyPrice: 29900,
    quotas: { sms: 1500, parcels: -1, stations: 3 },
    overagePrices: { sms: 8, parcels: 0, stations: 15900 },
    sort: 20,
    description: '适合多员工稳定运营',
  },
  {
    code: 'FLAGSHIP',
    name: '旗舰版',
    monthlyPrice: 69900,
    quotas: { sms: 5000, parcels: -1, stations: 10 },
    overagePrices: { sms: 6, parcels: 0, stations: 9900 },
    sort: 30,
    description: '适合多门店规模化经营',
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

const defaultDictionaries = [
  {
    type: 'courier_company',
    name: '快递公司',
    description: '快递和物流公司枚举',
    sort: 10,
    items: [
      ['SF', '顺丰速运', { shortName: '顺丰' }, 10],
      ['YTO', '圆通速递', { shortName: '圆通' }, 20],
      ['ZTO', '中通快递', { shortName: '中通' }, 30],
      ['STO', '申通快递', { shortName: '申通' }, 40],
    ],
  },
  {
    type: 'parcel_size',
    name: '包裹规格',
    description: '包裹体积规格枚举',
    sort: 20,
    items: [
      ['SMALL', '小件', { maxWeightGram: 1000 }, 10],
      ['MEDIUM', '中件', { maxWeightGram: 5000 }, 20],
      ['LARGE', '大件', { maxWeightGram: 20000 }, 30],
    ],
  },
  {
    type: 'exception_type',
    name: '异常类型',
    description: '异常件处理类型枚举',
    sort: 30,
    items: [
      ['DAMAGED', '破损', {}, 10],
      ['MISDELIVERED', '错投', {}, 20],
      ['UNCLAIMED', '滞留未取', {}, 30],
      ['REJECTED', '拒收', {}, 40],
      ['OVERSIZED', '超规格', {}, 50],
    ],
  },
  {
    type: 'notify_scene',
    name: '通知场景',
    description: '通知模板业务场景枚举',
    sort: 40,
    items: [
      ['PARCEL_STORED', '包裹入库', {}, 10],
      ['OVERDUE_REMIND', '滞留提醒', {}, 20],
      ['OVERDUE_URGE', '滞留催领', {}, 30],
      ['OVERDUE_FINAL', '退回预警', {}, 40],
      ['TENANT_APPROVED', '入驻通过', {}, 50],
      ['APPLICATION_REJECTED', '入驻驳回', {}, 60],
    ],
  },
] as const;

const defaultSystemConfigs = [
  {
    configKey: 'notify.sms.daily_limit',
    group: 'notify',
    name: '短信日发送上限',
    value: 5000,
    defaultValue: 5000,
    valueType: 'NUMBER' as const,
    editable: true,
    secret: false,
    description: '单租户每日短信发送上限',
  },
  {
    configKey: 'monitor.exception.warn_threshold',
    group: 'monitor',
    name: '异常预警阈值',
    value: 10,
    defaultValue: 10,
    valueType: 'NUMBER' as const,
    editable: true,
    secret: false,
    description: '门店异常件数达到该值后标记预警',
  },
  {
    configKey: 'security.jwt.expires_in',
    group: 'security',
    name: 'JWT 过期时间',
    value: '7d',
    defaultValue: '7d',
    valueType: 'STRING' as const,
    editable: false,
    secret: false,
    description: '访问令牌过期时间，由环境变量优先覆盖',
  },
];

const defaultChannelConfigs = [
  {
    channel: 'sms',
    provider: 'mock',
    fallbackProvider: 'mock',
    config: { registeredProviders: ['mock', 'tencent'] },
    description: '短信发送渠道',
  },
  {
    channel: 'pay',
    provider: 'mock',
    fallbackProvider: 'mock',
    config: { registeredProviders: ['mock', 'wechat'] },
    description: '支付渠道',
  },
  {
    channel: 'logistics',
    provider: 'mock',
    fallbackProvider: 'mock',
    config: { registeredProviders: ['mock', 'kuaidi100'] },
    description: '物流轨迹渠道',
  },
  {
    channel: 'ocr',
    provider: 'mock',
    fallbackProvider: 'mock',
    config: { registeredProviders: ['mock', 'provider'] },
    description: 'OCR 识别渠道',
  },
  {
    channel: 'storage',
    provider: 'mock',
    fallbackProvider: 'mock',
    config: { registeredProviders: ['mock', 'minio'] },
    description: '文件存储渠道',
  },
];

const defaultFaqEntries = [
  {
    category: 'PICKUP',
    question: '取件码在哪里查看？',
    answer:
      '您可以在用户端首页的「待取件」或「取件码」页面查看取件码。到站后向店员出示取件码即可领取包裹。',
    keywords: ['取件码', '取件', '领取', '待取件'],
    priority: 100,
  },
  {
    category: 'SHIPPING',
    question: '怎么在线寄件？',
    answer:
      '进入用户端「寄件」页面，填写寄件人、收件人、物品信息并选择快递报价，支付后把包裹交给驿站即可。',
    keywords: ['寄件', '在线寄件', '下单', '快递报价'],
    priority: 90,
  },
  {
    category: 'PARCEL_STATUS',
    question: '我的包裹到了吗？',
    answer:
      '您可以问我「我的包裹到了吗」，系统会在确认本人身份后查询在库包裹。如果有待取件，会返回取件码、库位和所在门店。',
    keywords: ['包裹', '到了吗', '在库', '物流', '状态'],
    priority: 110,
  },
  {
    category: 'MEMBER',
    question: '积分有什么用？',
    answer:
      '会员积分可用于兑换优惠券或参与驿站活动。积分明细和可用优惠券可在用户端「会员中心」查看。',
    keywords: ['积分', '会员', '优惠券', '兑换'],
    priority: 70,
  },
  {
    category: 'GENERAL',
    question: '在线客服可以帮我做什么？',
    answer:
      '在线客服可以解答取件、寄件、包裹状态、会员积分等问题；涉及本人包裹时，会通过受控查询工具读取您的真实包裹状态。',
    keywords: ['客服', '帮助', '问题', '咨询'],
    priority: 60,
  },
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
        { code: 'tenant:review', name: '审核入驻', module: 'tenant' },
        { code: 'platform:user:manage', name: '管理平台用户', module: 'identity' },
        { code: 'station:manage', name: '货架库位管理', module: 'station' },
        { code: 'station:read', name: '查看门店货架库位', module: 'station' },
        { code: 'parcel:inbound', name: '入库', module: 'parcel' },
        { code: 'parcel:pickup', name: '取件核销', module: 'parcel' },
        { code: 'parcel:read', name: '查看包裹通知', module: 'parcel' },
        ...shippingPerms,
        ...exceptionPerms,
        ...memberReviewPerms,
        ...analyticsPerms,
        ...billingPerms,
        ...adminConsolePerms,
      ];
      for (const perm of perms) {
        await tx.permission.upsert({
          where: { code: perm.code },
          update: { name: perm.name, module: perm.module },
          create: perm,
        });
      }

      for (const plan of defaultBillingPlans) {
        await tx.billingPlan.upsert({
          where: { code: plan.code },
          update: {
            name: plan.name,
            monthlyPrice: plan.monthlyPrice,
            quotas: plan.quotas,
            overagePrices: plan.overagePrices,
            status: 'ACTIVE',
            sort: plan.sort,
            description: plan.description,
          },
          create: {
            ...plan,
            status: 'ACTIVE',
          },
        });
      }

      for (const dictionary of defaultDictionaries) {
        const saved = await tx.dictionary.upsert({
          where: { type: dictionary.type },
          update: {
            name: dictionary.name,
            description: dictionary.description,
            enabled: true,
            sort: dictionary.sort,
          },
          create: {
            type: dictionary.type,
            name: dictionary.name,
            description: dictionary.description,
            enabled: true,
            sort: dictionary.sort,
          },
        });

        for (const [code, label, value, sort] of dictionary.items) {
          await tx.dictItem.upsert({
            where: {
              dictionaryId_code: {
                dictionaryId: saved.id,
                code,
              },
            },
            update: { label, value, enabled: true, sort },
            create: {
              dictionaryId: saved.id,
              code,
              label,
              value,
              enabled: true,
              sort,
            },
          });
        }
      }

      for (const config of defaultSystemConfigs) {
        await tx.systemConfig.upsert({
          where: { configKey: config.configKey },
          update: {
            group: config.group,
            name: config.name,
            defaultValue: config.defaultValue,
            valueType: config.valueType,
            editable: config.editable,
            secret: config.secret,
            description: config.description,
          },
          create: config,
        });
      }

      for (const channel of defaultChannelConfigs) {
        await tx.channelConfig.upsert({
          where: { channel: channel.channel },
          update: {
            provider: channel.provider,
            enabled: true,
            fallbackProvider: channel.fallbackProvider,
            config: channel.config,
            description: channel.description,
          },
          create: {
            ...channel,
            enabled: true,
          },
        });
      }

      for (const faq of defaultFaqEntries) {
        const exists = await tx.faqEntry.findFirst({
          where: { tenantId: null, question: faq.question },
        });
        const data = {
          tenantId: null,
          category: faq.category,
          question: faq.question,
          answer: faq.answer,
          keywords: [...faq.keywords],
          priority: faq.priority,
          enabled: true,
          source: 'seed:p4-2',
        };
        if (exists) {
          await tx.faqEntry.update({
            where: { id: exists.id },
            data,
          });
        } else {
          await tx.faqEntry.create({ data });
        }
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
        {
          code: 'TENANT_APPROVED',
          channel: 'IN_APP' as const,
          content:
            '入驻申请已通过，店长账号 {username}，套餐 {planCode}，请尽快完成首次登录。',
        },
        {
          code: 'TENANT_APPROVED',
          channel: 'SMS' as const,
          content:
            '【菜鸟驿站】入驻已通过，店长账号{username}，初始密码{tempPassword}，请登录后尽快修改。',
        },
        {
          code: 'APPLICATION_REJECTED',
          channel: 'SMS' as const,
          content:
            '【菜鸟驿站】入驻申请未通过，原因：{reason}。请补充材料后重新提交。',
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
              'plan:read',
              'subscription:read',
              'subscription:write',
              'usage:read',
              'invoice:read',
              'invoice:pay',
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
    { timeout: 120000 },
  );

  console.log('seed done: platform admin = admin / admin123456');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
