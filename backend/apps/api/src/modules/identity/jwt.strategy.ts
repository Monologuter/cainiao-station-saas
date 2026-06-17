import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    });
  }

  async validate(payload: any) {
    const perms = await this.prisma.$transaction(async (tx) => {
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
      return [...new Set(rows.map((item) => item.permission.code))];
    });

    return {
      userId: payload.sub,
      tenantId: payload.tenantId,
      roles: payload.roles,
      isPlatform: payload.isPlatform,
      perms,
    };
  }
}
