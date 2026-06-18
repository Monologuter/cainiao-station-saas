import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import {
  APPLICATION_REJECTED_NOTIFY_JOB,
  NOTIFY_QUEUE_NAME,
  PARCEL_OVERDUE_NOTIFY_JOB,
  PARCEL_STORED_NOTIFY_JOB,
  TENANT_APPROVED_NOTIFY_JOB,
  type NotifyJobData,
} from './notify-queue.constants';
import { notifyQueueRedisConnectionOptions } from './notify-queue.providers';
import { NotifyService } from './notify.service';

/**
 * BullMQ worker that turns notification jobs into actual channel sends.
 * Running asynchronously off the queue means a transient channel outage
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
      (job) => this.process(job as Job<NotifyJobData>),
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
  async process(job: Job<NotifyJobData>): Promise<void> {
    const payload = job.data;
    await TenantContext.run(
      {
        userId: 'system',
        tenantId: 'tenantId' in payload ? payload.tenantId : null,
        roles: [],
        isPlatform: !('tenantId' in payload),
      },
      () => this.dispatch(job),
    );
  }

  private async dispatch(job: Job<NotifyJobData>) {
    switch (job.name) {
      case PARCEL_STORED_NOTIFY_JOB:
        return this.notify.notifyParcelStored(job.data as any);
      case PARCEL_OVERDUE_NOTIFY_JOB:
        return this.notify.notifyParcelOverdue(job.data as any);
      case TENANT_APPROVED_NOTIFY_JOB:
        return this.notify.notifyTenantApproved(job.data as any);
      case APPLICATION_REJECTED_NOTIFY_JOB:
        return this.notify.notifyApplicationRejected(job.data as any);
      default:
        return undefined;
    }
  }
}
