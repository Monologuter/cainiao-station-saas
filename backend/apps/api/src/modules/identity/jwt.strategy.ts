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
    const { perms, user, assignedStationIds } = await this.prisma.$transaction(
      async (tx) => {
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
        select: {
          username: true,
          status: true,
          tokenVersion: true,
          tenant: { select: { status: true } },
        },
      });
      const assignments = await tx.staffStation.findMany({
        where: { userId: payload.sub },
        select: { stationId: true },
      });
      return {
        perms: [...new Set(rows.map((item) => item.permission.code))],
        user: found,
        assignedStationIds: assignments.map((item) => item.stationId),
      };
      },
    );
    if (
      !user ||
      user.status !== 'active' ||
      Number(payload.tokenVersion ?? -1) !== user.tokenVersion
    ) {
      throw new BizError(ApiCode.UNAUTHORIZED, 'access token 已失效');
    }

    const scope = computeStationScope({
      isPlatform: payload.isPlatform,
      roles: payload.roles ?? [],
      perms,
      assignedStationIds,
    });

    return {
      id: payload.sub,
      userId: payload.sub,
      username: user.username,
      tenantId: payload.tenantId,
      roles: payload.roles,
      isPlatform: payload.isPlatform,
      tenantStatus: user.tenant?.status ?? null,
      perms,
      allStations: scope.allStations,
      stations: scope.stations,
    };
  }
}
