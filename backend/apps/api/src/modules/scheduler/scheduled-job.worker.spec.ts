import {
  BILLING_EXPIRY_CHECK_JOB,
  BILLING_INVOICE_RUN_JOB,
  OVERDUE_SCAN_JOB,
} from '../../core/queue/queue.constants';
import { ScheduledJobWorker } from './scheduled-job.worker';

describe('ScheduledJobWorker', () => {
  it('dispatches repeatable queue jobs to domain processors', async () => {
    const queue = {} as any;
    const overdueScan = { runOverdueScan: jest.fn().mockResolvedValue({}) };
    const invoiceRun = { runInvoiceRun: jest.fn().mockResolvedValue({}) };
    const expiryCheck = { runExpiryCheck: jest.fn().mockResolvedValue({}) };
    const worker = new ScheduledJobWorker(
      queue,
      overdueScan as any,
      invoiceRun as any,
      expiryCheck as any,
    );

    await worker.process({ name: OVERDUE_SCAN_JOB } as any);
    await worker.process({ name: BILLING_INVOICE_RUN_JOB } as any);
    await worker.process({ name: BILLING_EXPIRY_CHECK_JOB } as any);

    expect(overdueScan.runOverdueScan).toHaveBeenCalledTimes(1);
    expect(invoiceRun.runInvoiceRun).toHaveBeenCalledTimes(1);
    expect(expiryCheck.runExpiryCheck).toHaveBeenCalledTimes(1);
  });
});
