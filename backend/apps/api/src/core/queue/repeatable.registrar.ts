import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { OVERDUE_SCAN_JOB, OVERDUE_SCAN_QUEUE } from './queue.constants';

@Injectable()
export class RepeatableRegistrar implements OnModuleInit {
  constructor(@Inject(OVERDUE_SCAN_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    await this.register();
  }

  async register() {
    await this.queue.add(
      OVERDUE_SCAN_JOB,
      {},
      {
        jobId: OVERDUE_SCAN_JOB,
        repeat: { pattern: process.env.OVERDUE_SCAN_CRON ?? '0 2 * * *' },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }
}
