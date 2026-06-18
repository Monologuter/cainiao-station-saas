import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import {
  BILLING_EXPIRY_CHECK_JOB,
  BILLING_INVOICE_RUN_JOB,
  OVERDUE_SCAN_JOB,
  OVERDUE_SCAN_QUEUE,
} from '../../core/queue/queue.constants';
import { queueRedisConnectionOptions } from '../../core/queue/queue.module';
import { ExpiryCheckProcessor } from '../billing/jobs/expiry-check.processor';
import { InvoiceRunProcessor } from '../billing/jobs/invoice-run.processor';
import { OverdueScanProcessor } from '../parcel/overdue/overdue-scan.processor';

@Injectable()
export class ScheduledJobWorker implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;

  constructor(
    @Inject(OVERDUE_SCAN_QUEUE) private readonly queue: Queue,
    private readonly overdueScan: OverdueScanProcessor,
    private readonly invoiceRun: InvoiceRunProcessor,
    private readonly expiryCheck: ExpiryCheckProcessor,
  ) {}

  onModuleInit() {
    this.worker = new Worker(this.queue.name, (job) => this.process(job), {
      connection: queueRedisConnectionOptions(),
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  async process(job: Pick<Job, 'name'>) {
    switch (job.name) {
      case OVERDUE_SCAN_JOB:
        return this.overdueScan.runOverdueScan();
      case BILLING_INVOICE_RUN_JOB:
        return this.invoiceRun.runInvoiceRun();
      case BILLING_EXPIRY_CHECK_JOB:
        return this.expiryCheck.runExpiryCheck();
      default:
        throw new Error(`Unknown scheduled job: ${job.name}`);
    }
  }
}
