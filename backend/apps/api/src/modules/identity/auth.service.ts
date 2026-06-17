import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { ApiCode, BizError } from '../../core/http/api-code';
import { PrismaService } from '../../core/prisma/prisma.service';

export interface MenuItem {
  code: string;
  title: string;
  path: string;
  icon: string;
  perm?: string;
  disabled?: boolean;
  badge?: string;
}

export interface MenuGroup {
  group: string;
  items: MenuItem[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    group: '代收业务',
    items: [
      {
        code: 'workbench',
        title: '工作台',
        path: '/workbench',
        icon: 'LayoutDashboard',
      },
      {
        code: 'inbound',
        title: '扫码入库',
        path: '/inbound',
        icon: 'ScanLine',
        perm: 'parcel:inbound',
      },
      {
        code: 'parcels',
        title: '在库包裹',
        path: '/parcels',
        icon: 'PackageSearch',
        perm: 'parcel:read',
      },
      {
        code: 'pickup',
        title: '取件核销',
        path: '/pickup',
        icon: 'BadgeCheck',
        perm: 'parcel:pickup',
      },
      {
        code: 'exceptions',
        title: '异常件',
        path: '/exceptions',
        icon: 'TriangleAlert',
        perm: 'parcel:read',
        disabled: true,
        badge: 'P2',
      },
    ],
  },
  {
    group: '网点管理',
    items: [
      {
        code: 'shelves',
        title: '货架库位',
        path: '/shelves',
        icon: 'Warehouse',
        perm: 'station:manage',
      },
      {
        code: 'shipping',
        title: '寄件管理',
        path: '/shipping',
        icon: 'Truck',
        perm: 'shipping:read',
      },
      {
        code: 'statistics',
        title: '经营统计',
        path: '/statistics',
        icon: 'ChartNoAxesColumn',
        disabled: true,
        badge: 'P2',
      },
      {
        code: 'staff-roles',
        title: '员工权限',
        path: '/staff-roles',
        icon: 'UsersRound',
        perm: 'station:manage',
      },
      {
        code: 'settings',
        title: '门店设置',
        path: '/settings',
        icon: 'Settings',
        perm: 'station:manage',
      },
    ],
  },
  {
    group: '平台运营',
    items: [
      {
        code: 'tenant-open',
        title: '开店入驻',
        path: '/platform/tenants/new',
        icon: 'Store',
        perm: 'tenant:create',
      },
      {
        code: 'tenant-list',
        title: '租户查看',
        path: '/platform/tenants',
        icon: 'Building2',
        perm: 'tenant:read',
      },
    ],
  },
];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.user.findFirst({
        where: { username },
        include: { roles: { include: { role: true } } },
      });
    });

    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new BizError(ApiCode.UNAUTHORIZED, '账号或密码错误');
    }

    const roles = user.roles.map((item) => item.role.code);
    const isPlatform = user.type === 'PLATFORM';
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      tenantId: user.tenantId,
      roles,
      isPlatform,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        tenantId: user.tenantId,
        roles,
        isPlatform,
      },
    };
  }

  menusFor(perms: string[]): MenuGroup[] {
    const owned = new Set(perms);
    return MENU_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.perm || owned.has(item.perm)),
    })).filter((group) => group.items.length > 0);
  }
}
