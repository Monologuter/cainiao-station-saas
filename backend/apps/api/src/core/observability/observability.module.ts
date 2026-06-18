import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  controllers: [HealthController, MetricsController],
  providers: [MetricsService, PrismaService, RedisService],
  exports: [MetricsService],
})
export class ObservabilityModule {}
