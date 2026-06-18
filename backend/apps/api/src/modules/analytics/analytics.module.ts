import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { requireJwtSecret } from '../../core/config/security-env';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisLockService } from '../../core/redis/redis-lock.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { ScheduledLockService } from '../../core/scheduler-lock/scheduler-lock.service';
import { FileModule } from '../file/file.module';
import { AnalyticsGateway } from './analytics.gateway';
import {
  AdminAnalyticsController,
  AnalyticsController,
} from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ForecastClient } from './forecast.client';
import { ForecastProcessor } from './forecast.processor';
import { ForecastService } from './forecast.service';
import {
  ParcelLifecycleAnalyticsListener,
  ParcelStoredAnalyticsListener,
  ShipOrderAnalyticsListener,
} from './listeners/analytics.listeners';
import { MetricsService } from './metrics.service';
import { QueryService } from './query.service';
import { RankingService } from './ranking.service';
import { RealtimePublisher } from './realtime.publisher';
import { ReconcileRunProcessor } from './reconcile-run.processor';
import { ReconcileService } from './reconcile.service';
import { ReportProcessor } from './report.processor';
import { ReportService } from './report.service';

@Module({
  imports: [
    FileModule,
    JwtModule.register({
      secret: requireJwtSecret(),
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '2h') as any },
    }),
  ],
  controllers: [AnalyticsController, AdminAnalyticsController],
  providers: [
    AnalyticsService,
    AnalyticsGateway,
    ForecastClient,
    ForecastProcessor,
    ForecastService,
    MetricsService,
    QueryService,
    RankingService,
    ReconcileService,
    ReconcileRunProcessor,
    ReportService,
    ReportProcessor,
    RealtimePublisher,
    ParcelStoredAnalyticsListener,
    ParcelLifecycleAnalyticsListener,
    ShipOrderAnalyticsListener,
    PrismaService,
    TenantPrismaService,
    RedisService,
    RedisLockService,
    ScheduledLockService,
  ],
  exports: [ReconcileRunProcessor],
})
export class AnalyticsModule {}
