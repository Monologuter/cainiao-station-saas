import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { RequirePermission } from '../identity/decorators';
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
  constructor(private readonly station: StationService) {}

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
}
