import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { MetricsService } from './metrics.service';

@Module({
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    MetricsService,
    PrismaService,
    TenantPrismaService,
    RedisService,
  ],
})
export class AnalyticsModule {}
