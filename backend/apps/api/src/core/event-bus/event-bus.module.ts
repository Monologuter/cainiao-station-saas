import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { EventBus } from './event-bus';

@Global()
@Module({
  providers: [EventBus, IdempotencyService],
  exports: [EventBus, IdempotencyService],
})
export class EventBusModule {}
