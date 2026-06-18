import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import {
  NOTIFY_QUEUE_NAME,
  PARCEL_STORED_NOTIFY_JOB,
  type ParcelStoredNotifyJobData,
} from './notify-queue.constants';
import { notifyQueueRedisConnectionOptions } from './notify-queue.providers';
import { NotifyService } from './notify.service';

/**
 * BullMQ worker that turns "ParcelStored" notification jobs into actual channel
 * sends. Running asynchronously off the queue means a transient channel outage
 * results in a retry (per NOTIFY_JOB_OPTIONS) rather than the notification being
 * silently dropped, which was the failure mode of the old in-process EventBus
 * handler. The send itself stays idempotent via notification.upsert
 * (tenantId_dedupKey) inside NotifyService.
 */
@Injectable()
export class NotifyProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotifyProcessor.name);
  private worker?: Worker;

  constructor(private readonly notify: NotifyService) {}

  onModuleInit() {
    this.worker = new Worker(
      NOTIFY_QUEUE_NAME,
      (job) => this.process(job as Job<ParcelStoredNotifyJobData>),
      { connection: notifyQueueRedisConnectionOptions() },
    );
    this.worker.on('failed', (job, error) => {
      if (!job) {
        return;
      }
      const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
      const level = exhausted ? 'error' : 'warn';
      this.logger[level](
        `Notify job ${job.name}:${job.id} attempt ${job.attemptsMade}/${
          job.opts.attempts ?? 1
        } failed${exhausted ? ' (dead-lettered)' : ', will retry'}: ${
          error?.message ?? error
        }`,
      );
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  /**
   * Handle a single notify job. Errors are re-thrown so BullMQ records the
   * attempt as failed and applies the configured retry/backoff. Exhausted jobs
   * stay in the `failed` set (dead-letter) for inspection / redrive.
   */
  async process(job: Job<ParcelStoredNotifyJobData>): Promise<void> {
    if (job.name !== PARCEL_STORED_NOTIFY_JOB) {
      return;
    }
    const payload = job.data;
    await TenantContext.run(
      {
        userId: 'system',
        tenantId: payload.tenantId,
        roles: [],
        isPlatform: false,
      },
      () => this.notify.notifyParcelStored(payload),
    );
  }
}
