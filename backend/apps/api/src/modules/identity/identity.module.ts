import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { requireJwtSecret } from '../../core/config/security-env';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PlatformUserController } from './platform-user.controller';
import { PlatformUserService } from './platform-user.service';

@Module({
  imports: [
    JwtModule.register({
      secret: requireJwtSecret(),
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '2h') as any },
    }),
  ],
  controllers: [AuthController, PlatformUserController],
  providers: [
    AuthService,
    JwtStrategy,
    PlatformUserService,
    PrismaService,
    RedisService,
  ],
  exports: [AuthService],
})
export class IdentityModule {}
