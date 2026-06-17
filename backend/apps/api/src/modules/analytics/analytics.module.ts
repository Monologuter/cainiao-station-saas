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
import { QueryService } from './query.service';
import { RankingService } from './ranking.service';
import { RealtimePublisher } from './realtime.publisher';
import { ReconcileService } from './reconcile.service';

@Module({
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    MetricsService,
    QueryService,
    RankingService,
    ReconcileService,
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
