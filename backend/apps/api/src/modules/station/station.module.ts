import { Module } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { ShelfController } from './shelf.controller';
import { SlotService } from './slot.service';
import { StationController } from './station.controller';
import { StationService } from './station.service';

@Module({
  controllers: [StationController, ShelfController],
  providers: [StationService, SlotService, PrismaService, TenantPrismaService],
  exports: [StationService, SlotService],
})
export class StationModule {}
