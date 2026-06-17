import { Body, Controller, Post } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { RequirePermission } from '../identity/decorators';
import { PickupService } from './pickup.service';

class PickupDto {
  @IsString()
  stationId: string;

  @IsOptional()
  @IsString()
  pickupCode?: string;

  @IsOptional()
  @IsString()
  phoneTail?: string;

  @IsOptional()
  @IsString()
  parcelId?: string;
}

@Controller('pickup')
export class PickupController {
  constructor(private readonly pickupService: PickupService) {}

  @RequirePermission('parcel:pickup')
  @Post()
  pickup(@Body() dto: PickupDto) {
    return this.pickupService.pickup(dto);
  }
}
