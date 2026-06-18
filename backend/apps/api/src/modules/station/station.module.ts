import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { RedisLockService } from '../../core/redis/redis-lock.service';
import { RedisService } from '../../core/redis/redis.service';
import { ShelfController } from './shelf.controller';
import { SlotAllocatorService } from './slot-allocator.service';
import { SlotHeatService } from './slot-heat.service';
import { SlotHeatSubscriber } from './slot-heat.subscriber';
import { SlotRecommenderClient } from './slot-recommender.client';
import { SlotReleaseSubscriber } from './slot-release.subscriber';
import { SlotService } from './slot.service';
import { StationController } from './station.controller';
import { StationService } from './station.service';

@Module({
  controllers: [StationController, ShelfController],
  providers: [
    StationService,
    SlotService,
    SlotAllocatorService,
    SlotHeatService,
    SlotHeatSubscriber,
    SlotRecommenderClient,
    SlotReleaseSubscriber,
    PrismaService,
    TenantPrismaService,
    RedisService,
    RedisLockService,
  ],
  exports: [StationService, SlotService, SlotAllocatorService, SlotHeatService],
})
export class StationModule {}
