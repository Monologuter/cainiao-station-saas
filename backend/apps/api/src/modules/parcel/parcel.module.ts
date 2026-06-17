import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { RedisLockService } from '../../core/redis/redis-lock.service';
import { RedisService } from '../../core/redis/redis.service';
import { OverdueScanProcessor } from './overdue/overdue-scan.processor';
import { ParcelController } from './parcel.controller';
import { ParcelService } from './parcel.service';

@Module({
  controllers: [ParcelController],
  providers: [
    ParcelService,
    OverdueScanProcessor,
    PrismaService,
    TenantPrismaService,
    RedisService,
    RedisLockService,
  ],
  exports: [ParcelService, OverdueScanProcessor],
})
export class ParcelModule {}
