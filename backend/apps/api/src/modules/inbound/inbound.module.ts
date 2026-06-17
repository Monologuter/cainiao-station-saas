import { Module } from '@nestjs/common';
import { EventBus } from '../../core/event-bus/event-bus';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { RedisLockService } from '../../core/redis/redis-lock.service';
import { RedisService } from '../../core/redis/redis.service';
import { ParcelService } from '../parcel/parcel.service';
import { SlotAllocatorService } from '../station/slot-allocator.service';
import { InboundController } from './inbound.controller';
import { InboundService } from './inbound.service';
import { PickupCodeService } from './pickup-code.service';

@Module({
  controllers: [InboundController],
  providers: [
    InboundService,
    PickupCodeService,
    ParcelService,
    SlotAllocatorService,
    PrismaService,
    TenantPrismaService,
    RedisService,
    RedisLockService,
    EventBus,
  ],
  exports: [InboundService, PickupCodeService],
})
export class InboundModule {}
