import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { RedisLockService } from '../../core/redis/redis-lock.service';
import { RedisService } from '../../core/redis/redis.service';
import { AiModule } from '../ai/ai.module';
import { FileModule } from '../file/file.module';
import { ParcelService } from '../parcel/parcel.service';
import { SlotAllocatorService } from '../station/slot-allocator.service';
import { InboundController } from './inbound.controller';
import { InboundOcrController } from './inbound-ocr.controller';
import { InboundOcrService } from './inbound-ocr.service';
import { InboundService } from './inbound.service';
import { PickupCodeService } from './pickup-code.service';

@Module({
  imports: [AiModule, FileModule],
  controllers: [InboundController, InboundOcrController],
  providers: [
    InboundService,
    InboundOcrService,
    PickupCodeService,
    ParcelService,
    SlotAllocatorService,
    PrismaService,
    TenantPrismaService,
    RedisService,
    RedisLockService,
  ],
  exports: [InboundService, PickupCodeService],
})
export class InboundModule {}
