import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { ParcelService } from './parcel.service';

@Module({
  providers: [ParcelService, PrismaService, TenantPrismaService],
  exports: [ParcelService],
})
export class ParcelModule {}
