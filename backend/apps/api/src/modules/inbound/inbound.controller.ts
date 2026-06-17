import { Body, Controller, Headers, Post } from '@nestjs/common';
import { IsOptional, IsString, Matches } from 'class-validator';
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
}

@Controller('inbound')
export class InboundController {
  constructor(private readonly inboundService: InboundService) {}

  @RequirePermission('parcel:inbound')
  @Post()
  inbound(@Body() dto: InboundDto, @Headers('Idempotency-Key') _key?: string) {
    return this.inboundService.inbound(dto);
  }
}
