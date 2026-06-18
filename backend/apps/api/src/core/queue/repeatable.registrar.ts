import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  BILLING_EXPIRY_CHECK_JOB,
  BILLING_INVOICE_RUN_JOB,
  OVERDUE_SCAN_JOB,
  OVERDUE_SCAN_QUEUE,
} from './queue.constants';

@Injectable()
export class RepeatableRegistrar implements OnModuleInit {
  constructor(@Inject(OVERDUE_SCAN_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    await this.register();
  }

  async register() {
    await this.registerJob(
      OVERDUE_SCAN_JOB,
      process.env.OVERDUE_SCAN_CRON ?? '0 2 * * *',
    );
    await this.registerJob(
      BILLING_INVOICE_RUN_JOB,
      process.env.BILLING_INVOICE_RUN_CRON ?? '0 1 * * *',
    );
    await this.registerJob(
      BILLING_EXPIRY_CHECK_JOB,
      process.env.BILLING_EXPIRY_CHECK_CRON ?? '0 3 * * *',
    );
  }

  private async registerJob(name: string, pattern: string) {
    await this.queue.add(
      name,
      {},
      {
        jobId: name,
        repeat: { pattern },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }
}
