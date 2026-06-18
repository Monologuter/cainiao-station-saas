import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { requireJwtSecret } from '../../core/config/security-env';
import { ApiCode, BizError } from '../../core/http/api-code';
import { PrismaService } from '../../core/prisma/prisma.service';
import { computeStationScope } from '../../core/tenant-context/station-scope';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: requireJwtSecret(),
    });
  }

  async validate(payload: any) {
    const { perms, user } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      const rows = await tx.rolePermission.findMany({
        where: {
          role: {
            code: { in: payload.roles ?? [] },
            tenantId: payload.isPlatform ? null : payload.tenantId,
          },
        },
        include: { permission: true },
      });
      const found = await tx.user.findUnique({
        where: { id: payload.sub },
        select: { username: true, status: true, tokenVersion: true },
      });
      return {
        perms: [...new Set(rows.map((item) => item.permission.code))],
        user: found,
      };
    });
    if (
      !user ||
      user.status !== 'active' ||
      Number(payload.tokenVersion ?? -1) !== user.tokenVersion
    ) {
      throw new BizError(ApiCode.UNAUTHORIZED, 'access token 已失效');
    }

    // 优先信任 JWT 内已计算的门店作用域；旧 token 缺失时基于角色/权限回退推导，
    // 保证店长（含 station:manage）仍享全门店可见性，店员仍受 stations 限制。
    const scope =
      payload.allStations === undefined && payload.stations === undefined
        ? computeStationScope({
            isPlatform: payload.isPlatform,
            roles: payload.roles ?? [],
            perms,
            assignedStationIds: [],
          })
        : {
            allStations: !!payload.allStations,
            stations: payload.stations ?? [],
          };

    return {
      id: payload.sub,
      userId: payload.sub,
      username: user.username,
      tenantId: payload.tenantId,
      roles: payload.roles,
      isPlatform: payload.isPlatform,
      perms,
      allStations: scope.allStations,
      stations: scope.stations,
    };
  }
}
