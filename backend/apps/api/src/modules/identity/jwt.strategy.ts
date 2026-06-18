import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../core/prisma/prisma.service';
import { computeStationScope } from '../../core/tenant-context/station-scope';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    });
  }

  async validate(payload: any) {
    const { perms, username } = await this.prisma.$transaction(async (tx) => {
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
        select: { username: true },
      });
      return {
        perms: [...new Set(rows.map((item) => item.permission.code))],
        username: found?.username ?? payload.username ?? null,
      };
    });

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
      username,
      tenantId: payload.tenantId,
      roles: payload.roles,
      isPlatform: payload.isPlatform,
      perms,
      allStations: scope.allStations,
      stations: scope.stations,
    };
  }
}
