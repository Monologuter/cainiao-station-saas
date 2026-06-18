import { Body, Controller, Post } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { RateLimit } from '../../core/rate-limit/rate-limit.decorator';
import { RequirePermission } from '../identity/decorators';
import { PickupService } from './pickup.service';

class PickupDto {
  @IsString()
  stationId: string;

  // 取件码 / 手机尾号 / 包裹号至少提供一项即可核销（防空参由 service 保证）。
  @IsOptional()
  @IsString()
  pickupCode?: string;

  @IsOptional()
  @IsString()
  phoneTail?: string;

  @IsOptional()
  @IsString()
  parcelId?: string;

  @IsOptional()
  @IsString()
  authorizedPhone?: string;
}

@Controller('pickup')
export class PickupController {
  constructor(private readonly pickupService: PickupService) {}

  @RequirePermission('parcel:pickup')
  @RateLimit({
    keyPrefix: 'pickup',
    strategy: 'token-bucket',
    limit: 30,
    windowMs: 60_000,
    keyBy: 'user',
  })
  @Post()
  pickup(@Body() dto: PickupDto) {
    return this.pickupService.pickup(dto);
  }
}
