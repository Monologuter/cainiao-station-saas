import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { MemberModule } from '../member/member.module';
import {
  ConsumerReviewController,
  ReviewAdminController,
} from './review.controller';
import { ReviewService } from './review.service';
import { SatisfactionService } from './satisfaction.service';

@Module({
  imports: [
    MemberModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [ConsumerReviewController, ReviewAdminController],
  providers: [
    ReviewService,
    SatisfactionService,
    PrismaService,
    TenantPrismaService,
    RedisService,
  ],
  exports: [ReviewService, SatisfactionService],
})
export class ReviewModule {}
