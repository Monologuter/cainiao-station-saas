import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { ApiCode, BizError } from '../../core/http/api-code';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { computeStationScope } from '../../core/tenant-context/station-scope';

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
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

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
        perm: 'exception:read',
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
    private readonly redis: RedisService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.user.findFirst({
        where: { username },
        include: {
          tenant: { select: { status: true } },
          roles: { include: { role: true } },
        },
      });
    });

    if (
      !user ||
      user.status !== 'active' ||
      !(await argon2.verify(user.passwordHash, password))
    ) {
      throw new BizError(ApiCode.UNAUTHORIZED, '账号或密码错误');
    }

    const roles = user.roles.map((item) => item.role.code);
    const isPlatform = user.type === 'PLATFORM';
    const scope = computeStationScope({
      isPlatform,
      roles,
      assignedStationIds: await this.assignedStationIds(user.id),
    });
    const accessToken = await this.signAccessToken({
      userId: user.id,
      username: user.username,
      tenantId: user.tenantId,
      roles,
      isPlatform,
      scope,
      tokenVersion: user.tokenVersion,
    });
    const refreshToken = await this.issueRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        tenantId: user.tenantId,
        roles,
        isPlatform,
        tenantStatus: user.tenant?.status ?? null,
        allStations: scope.allStations,
        stations: scope.stations,
      },
    };
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefresh(refreshToken);
    const client = this.redis.getClient();
    const sessionKey = this.refreshKey(payload.jti);
    const session = await client.get(sessionKey);
    if (!session) {
      await this.revokeUserSessions(payload.sub);
      throw new BizError(ApiCode.UNAUTHORIZED, 'refresh token 已失效');
    }

    await client.del(sessionKey);
    await client.srem(this.userSessionsKey(payload.sub), payload.jti);

    const user = await this.loadUserById(payload.sub);
    const roles = user.roles.map((item) => item.role.code);
    const isPlatform = user.type === 'PLATFORM';
    const scope = computeStationScope({
      isPlatform,
      roles,
      assignedStationIds: await this.assignedStationIds(user.id),
    });
    return {
      accessToken: await this.signAccessToken({
        userId: user.id,
        username: user.username,
        tenantId: user.tenantId,
        roles,
        isPlatform,
        scope,
        tokenVersion: user.tokenVersion,
      }),
      refreshToken: await this.issueRefreshToken(user.id),
      user: {
        id: user.id,
        username: user.username,
        tenantId: user.tenantId,
        roles,
        isPlatform,
        tenantStatus: user.tenant?.status ?? null,
        allStations: scope.allStations,
        stations: scope.stations,
      },
    };
  }

  async logout(refreshToken: string) {
    const payload = await this.verifyRefresh(refreshToken);
    const client = this.redis.getClient();
    await client.del(this.refreshKey(payload.jti));
    await client.srem(this.userSessionsKey(payload.sub), payload.jti);
    return { loggedOut: true };
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ) {
    const user = await this.loadUserById(userId);
    if (!(await argon2.verify(user.passwordHash, oldPassword))) {
      throw new BizError(ApiCode.UNAUTHORIZED, '原密码错误');
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
    });
    await this.revokeUserSessions(userId);
    return { changed: true };
  }

  menusFor(perms: string[]): MenuGroup[] {
    const owned = new Set(perms);
    return MENU_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.perm || owned.has(item.perm)),
    })).filter((group) => group.items.length > 0);
  }

  private async loadUserById(id: string) {
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.user.findUnique({
        where: { id },
        include: {
          tenant: { select: { status: true } },
          roles: { include: { role: true } },
        },
      });
    });
    if (!user || user.status !== 'active') {
      throw new BizError(ApiCode.UNAUTHORIZED, '用户不存在');
    }
    return user;
  }

  private async assignedStationIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.staffStation.findMany({
        where: { userId },
        select: { stationId: true },
      });
    });
    return rows.map((row) => row.stationId);
  }

  private signAccessToken(input: {
    userId: string;
    username: string;
    tenantId: string | null;
    roles: string[];
    isPlatform: boolean;
    scope: { allStations: boolean; stations: string[] };
    tokenVersion: number;
  }) {
    return this.jwt.signAsync({
      sub: input.userId,
      username: input.username,
      tenantId: input.tenantId,
      roles: input.roles,
      isPlatform: input.isPlatform,
      allStations: input.scope.allStations,
      stations: input.scope.stations,
      tokenVersion: input.tokenVersion,
    });
  }

  private async issueRefreshToken(userId: string) {
    const jti = randomUUID();
    const token = await this.jwt.signAsync(
      { sub: userId, jti, typ: 'refresh' },
      { expiresIn: `${REFRESH_TTL_SECONDS}s` },
    );
    const client = this.redis.getClient();
    await client.set(
      this.refreshKey(jti),
      JSON.stringify({ userId, issuedAt: new Date().toISOString() }),
      'EX',
      REFRESH_TTL_SECONDS,
    );
    await client.sadd(this.userSessionsKey(userId), jti);
    await client.expire(this.userSessionsKey(userId), REFRESH_TTL_SECONDS);
    return token;
  }

  private async verifyRefresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken);
      if (payload?.typ !== 'refresh' || !payload.sub || !payload.jti) {
        throw new Error('invalid refresh token');
      }
      return payload as { sub: string; jti: string; typ: 'refresh' };
    } catch {
      throw new BizError(ApiCode.UNAUTHORIZED, 'refresh token 无效');
    }
  }

  private async revokeUserSessions(userId: string) {
    const client = this.redis.getClient();
    const setKey = this.userSessionsKey(userId);
    const sessionIds = await client.smembers(setKey);
    if (sessionIds.length > 0) {
      await client.del(...sessionIds.map((jti) => this.refreshKey(jti)));
    }
    await client.del(setKey);
  }

  private refreshKey(jti: string) {
    return `auth:refresh:${jti}`;
  }

  private userSessionsKey(userId: string) {
    return `auth:user-sessions:${userId}`;
  }
}
