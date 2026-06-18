import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { RequirePermission } from '../identity/decorators';
import { SlotHeatService } from './slot-heat.service';
import { SlotService } from './slot.service';
import { StationService } from './station.service';

class CreateShelfDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  zone?: string;
}

@Controller('stations')
export class StationController {
  constructor(
    private readonly station: StationService,
    private readonly slots: SlotService,
    private readonly heat: SlotHeatService,
  ) {}

  @RequirePermission('station:manage')
  @Post(':id/shelves')
  createShelf(@Param('id') stationId: string, @Body() dto: CreateShelfDto) {
    return this.station.createShelf(stationId, dto);
  }

  @RequirePermission('station:read')
  @Get(':id/shelves')
  listShelves(@Param('id') stationId: string) {
    return this.station.listShelves(stationId);
  }

  @RequirePermission('station:read')
  @Get(':id/slots/free')
  listFreeSlots(
    @Param('id') stationId: string,
    @Query('limit') limit?: string,
  ) {
    return this.slots.listFree(stationId, limit ? Number(limit) : undefined);
  }

  @RequirePermission('station:read')
  @Get(':id/slots/heatmap')
  heatmap(@Param('id') stationId: string, @Query('date') date?: string) {
    return this.heat.heatmap(
      stationId,
      date ?? new Date().toISOString().slice(0, 10),
    );
  }
}
