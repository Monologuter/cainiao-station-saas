import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import {
  ParcelLifecycleAnalyticsListener,
  ParcelStoredAnalyticsListener,
  ShipOrderAnalyticsListener,
} from './listeners/analytics.listeners';
import { MetricsService } from './metrics.service';
import { RealtimePublisher } from './realtime.publisher';

@Module({
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    MetricsService,
    RealtimePublisher,
    ParcelStoredAnalyticsListener,
    ParcelLifecycleAnalyticsListener,
    ShipOrderAnalyticsListener,
    PrismaService,
    TenantPrismaService,
    RedisService,
  ],
})
export class AnalyticsModule {}
