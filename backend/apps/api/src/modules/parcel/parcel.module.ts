import { Module } from '@nestjs/common';
import { EventBus } from '../../core/event-bus/event-bus';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { ParcelService } from './parcel.service';

@Module({
  providers: [ParcelService, PrismaService, TenantPrismaService, EventBus],
  exports: [ParcelService],
})
export class ParcelModule {}
