import { Body, Controller, Post } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RateLimit } from '../../core/rate-limit/rate-limit.decorator';
import { RequirePermission } from '../identity/decorators';
import { PickupService } from './pickup.service';

class PickupDto {
  @IsString()
  stationId: string;

  // SEC-11 双因子：取件码 + 手机尾号均为核销必填项。
  @IsString()
  @IsNotEmpty()
  pickupCode: string;

  @IsString()
  @IsNotEmpty()
  phoneTail: string;

  // parcelId 仅用于定位（缩小匹配范围），不是核销凭证。
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
