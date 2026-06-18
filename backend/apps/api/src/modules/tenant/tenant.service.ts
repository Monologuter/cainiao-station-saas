import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../core/prisma/prisma.service';

interface CreateTenantInput {
  name: string;
  ownerName: string;
  ownerPhone: string;
  ownerPassword: string;
  stationName?: string;
  stationAddress?: string;
}

const TENANT_DEFAULT_PERMISSIONS = [
  { code: 'station:manage', name: '货架库位管理', module: 'station' },
  { code: 'station:read', name: '查看门店货架库位', module: 'station' },
  { code: 'parcel:inbound', name: '入库', module: 'parcel' },
  { code: 'parcel:pickup', name: '取件核销', module: 'parcel' },
  { code: 'parcel:read', name: '查看包裹通知', module: 'parcel' },
  { code: 'shipping:quote', name: '寄件报价', module: 'shipping' },
  { code: 'shipping:create', name: '创建寄件单', module: 'shipping' },
  { code: 'shipping:read', name: '查看寄件单', module: 'shipping' },
  { code: 'shipping:pay', name: '寄件支付', module: 'shipping' },
  { code: 'shipping:collect', name: '寄件揽收', module: 'shipping' },
  { code: 'shipping:cancel', name: '取消寄件单', module: 'shipping' },
  { code: 'exception:create', name: '标记异常件', module: 'exception' },
  { code: 'exception:read', name: '查看异常件', module: 'exception' },
  { code: 'exception:handle', name: '处理异常件', module: 'exception' },
  { code: 'parcel:overdue:scan', name: '手动滞留扫描', module: 'parcel' },
  { code: 'review:read', name: '查看评价', module: 'review' },
  { code: 'review:reply', name: '回复评价', module: 'review' },
  { code: 'review:manage', name: '管理评价', module: 'review' },
  { code: 'complaint:read', name: '查看投诉', module: 'review' },
  { code: 'complaint:handle', name: '处理投诉', module: 'review' },
  { code: 'coupon:manage', name: '管理优惠券', module: 'member' },
  { code: 'coupon:issue', name: '发放优惠券', module: 'member' },
  { code: 'analytics:read', name: '查看运营大屏', module: 'analytics' },
  { code: 'analytics:export', name: '导出运营报表', module: 'analytics' },
  { code: 'plan:read', name: '查看套餐', module: 'billing' },
  { code: 'subscription:read', name: '查看订阅', module: 'billing' },
  { code: 'subscription:write', name: '管理订阅', module: 'billing' },
  { code: 'usage:read', name: '查看用量', module: 'billing' },
  { code: 'invoice:read', name: '查看账单', module: 'billing' },
  { code: 'invoice:pay', name: '支付账单', module: 'billing' },
];

const EXTRA_AVAILABLE_PERMISSIONS = [
  { code: 'platform:user:manage', name: '管理平台用户', module: 'identity' },
  { code: 'tenant:review', name: '审核入驻', module: 'tenant' },
  { code: 'analytics:reconcile', name: '手动对账重算', module: 'analytics' },
  {
    code: 'analytics:platform:read',
    name: '查看平台运营总览',
    module: 'analytics',
  },
  { code: 'plan:write', name: '管理套餐', module: 'billing' },
  { code: 'subscription:admin', name: '平台订阅管理', module: 'billing' },
  { code: 'usage:meter', name: '上报用量', module: 'billing' },
  { code: 'invoice:run', name: '手动出账', module: 'billing' },
  { code: 'invoice:admin', name: '平台账单管理', module: 'billing' },
];

const DEFAULT_PRICE_RULES = [
  ['SF', '顺丰速运', 900, 500, 12],
  ['YTO', '圆通速递', 600, 300, 48],
  ['ZTO', '中通快递', 650, 280, 36],
  ['STO', '申通快递', 580, 260, 60],
] as const;

const ZONES = [
  ['SAME_CITY', 1.0],
  ['SAME_PROVINCE', 1.1],
  ['CROSS_PROVINCE', 1.3],
  ['REMOTE', 1.6],
] as const;

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async listTenants(query: { status?: string } = {}) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const where = query.status ? { status: query.status as any } : {};
      const list = await tx.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { stations: { select: { id: true } }, users: { select: { id: true } } },
      });
      return {
        list: list.map((tenant) => ({
          id: tenant.id,
          name: tenant.name,
          ownerName: tenant.ownerName,
          contactPhone: tenant.contactPhone,
          status: tenant.status,
          stationCount: tenant.stations.length,
          userCount: tenant.users.length,
          createdAt: tenant.createdAt,
        })),
        total: list.length,
      };
    });
  }

  async updateStatus(id: string, status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED') {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.tenant.update({
        where: { id },
        data: { status },
      });
    });
  }

  async createTenant(input: CreateTenantInput, externalTx?: any) {
    const passwordHash = await argon2.hash(input.ownerPassword);

    const createWithTx = async (tx: any) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const tenant = await tx.tenant.create({
        data: {
          name: input.name,
          ownerName: input.ownerName,
          contactPhone: input.ownerPhone,
        },
      });
      const station = await tx.station.create({
        data: {
          tenantId: tenant.id,
          name: input.stationName ?? input.name,
          code: 'S001',
        },
      });
      const ownerRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          code: '店长',
          name: '店长',
          scope: 'TENANT',
          isBuiltin: true,
        },
      });
      for (const perm of TENANT_DEFAULT_PERMISSIONS) {
        await tx.permission.upsert({
          where: { code: perm.code },
          update: { name: perm.name, module: perm.module },
          create: perm,
        });
      }
      for (const perm of EXTRA_AVAILABLE_PERMISSIONS) {
        await tx.permission.upsert({
          where: { code: perm.code },
          update: { name: perm.name, module: perm.module },
          create: perm,
        });
      }
      const ownerPerms = await tx.permission.findMany({
        where: {
          code: {
            in: TENANT_DEFAULT_PERMISSIONS.map((permission) => permission.code),
          },
        },
      });
      if (ownerPerms.length > 0) {
        await tx.rolePermission.createMany({
          data: ownerPerms.map((permission) => ({
            roleId: ownerRole.id,
            permissionId: permission.id,
          })),
          skipDuplicates: true,
        });
      }
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          type: 'STAFF',
          username: input.ownerPhone,
          passwordHash,
          phone: input.ownerPhone,
        },
      });
      await tx.userRole.create({
        data: { userId: user.id, roleId: ownerRole.id },
      });
      await tx.priceRule.createMany({
        data: this.defaultPriceRules(tenant.id),
      });

      return {
        tenantId: tenant.id,
        stationId: station.id,
        ownerUserId: user.id,
      };
    };

    if (externalTx) {
      return createWithTx(externalTx);
    }
    return this.prisma.$transaction(createWithTx);
  }

  private defaultPriceRules(tenantId: string) {
    return DEFAULT_PRICE_RULES.flatMap(
      ([courierCode, courierName, firstPrice, addPrice, estHours]) =>
        ZONES.map(([zone, zoneFactor], index) => ({
          tenantId,
          courierCode,
          courierName,
          zone,
          firstWeightGram: 1000,
          firstPrice,
          addUnitGram: 1000,
          addPrice,
          zoneFactor,
          estHours: estHours + index * 12,
          enabled: true,
          priority: 0,
        })),
    );
  }
}
