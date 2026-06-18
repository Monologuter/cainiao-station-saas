import { Body, Controller, Headers, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { RateLimit } from '../../core/rate-limit/rate-limit.decorator';
import { RequirePermission } from '../identity/decorators';
import { InboundService } from './inbound.service';

class InboundDto {
  @IsString()
  stationId: string;

  @IsString()
  waybillNo: string;

  @IsOptional()
  @IsString()
  carrier?: string;

  @IsString()
  @Matches(/^1\d{10}$/)
  receiverPhone: string;

  // FUNC-1: 可选包裹尺寸；缺省由服务端落到默认 M。
  @IsOptional()
  @IsIn(['S', 'M', 'L'])
  size?: 'S' | 'M' | 'L';
}

@Controller('inbound')
export class InboundController {
  constructor(private readonly inboundService: InboundService) {}

  @RequirePermission('parcel:inbound')
  @RateLimit({
    keyPrefix: 'inbound',
    strategy: 'token-bucket',
    limit: 60,
    windowMs: 60_000,
    keyBy: 'user',
  })
  @Post()
  inbound(@Body() dto: InboundDto, @Headers('Idempotency-Key') _key?: string) {
    return this.inboundService.inbound(dto);
  }
}
