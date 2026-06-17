import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { StationController } from './station.controller';
import { StationService } from './station.service';

@Module({
  controllers: [StationController],
  providers: [StationService, PrismaService, TenantPrismaService],
  exports: [StationService],
})
export class StationModule {}
