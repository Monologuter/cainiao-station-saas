import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { RedisLockService } from '../../core/redis/redis-lock.service';
import { RedisService } from '../../core/redis/redis.service';
import { PickupCodeService } from '../inbound/pickup-code.service';
import { ParcelService } from '../parcel/parcel.service';
import { PickupController } from './pickup.controller';
import { PickupService } from './pickup.service';

@Module({
  controllers: [PickupController],
  providers: [
    PickupService,
    ParcelService,
    PickupCodeService,
    PrismaService,
    TenantPrismaService,
    RedisService,
    RedisLockService,
  ],
  exports: [PickupService],
})
export class PickupModule {}
