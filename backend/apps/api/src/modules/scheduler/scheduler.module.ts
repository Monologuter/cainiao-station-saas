import { Module } from '@nestjs/common';
import { QueueModule } from '../../core/queue/queue.module';
import { BillingModule } from '../billing/billing.module';
import { ParcelModule } from '../parcel/parcel.module';
import { ScheduledJobWorker } from './scheduled-job.worker';

@Module({
  imports: [QueueModule, BillingModule, ParcelModule],
  providers: [ScheduledJobWorker],
})
export class SchedulerModule {}
