import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { MemberController } from './member.controller';
import { MemberService } from './member.service';
import { PointService } from './point.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [MemberController],
  providers: [MemberService, PointService, PrismaService, RedisService],
  exports: [MemberService, PointService],
})
export class MemberModule {}
