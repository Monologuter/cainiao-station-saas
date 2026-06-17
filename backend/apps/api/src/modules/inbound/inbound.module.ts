import { Module } from '@nestjs/common';
import { RedisService } from '../../core/redis/redis.service';
import { PickupCodeService } from './pickup-code.service';

@Module({
  providers: [PickupCodeService, RedisService],
  exports: [PickupCodeService],
})
export class InboundModule {}
