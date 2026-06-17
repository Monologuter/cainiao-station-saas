import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { ApiCode, BizError } from '../../core/http/api-code';
import { PrismaService } from '../../core/prisma/prisma.service';

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
}
