import { ScheduledLockService } from '../../../core/scheduler-lock/scheduler-lock.service';
import { InvoiceService } from '../invoice/invoice.service';
import { InvoiceRunProcessor } from './invoice-run.processor';

function createProcessor(subscriptions: any[]) {
  const tx = {
    $executeRawUnsafe: jest.fn(),
    subscription: {
      findMany: jest.fn().mockResolvedValue(subscriptions),
    },
  };
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) } as any;
  const schedulerLocks = {
    runExclusive: jest.fn((_name, _ttl, fn) => fn()),
  } as unknown as jest.Mocked<ScheduledLockService>;
  const invoices = {
    generateInvoice: jest.fn().mockResolvedValue({ id: 'inv-1' }),
  } as unknown as jest.Mocked<InvoiceService>;
  return {
    processor: new InvoiceRunProcessor(prisma, schedulerLocks, invoices),
    tx,
    schedulerLocks,
    invoices,
  };
}

describe('InvoiceRunProcessor', () => {
  it('scans due subscriptions under lock and generates invoices in tenant context', async () => {
    const now = new Date('2026-07-01T00:00:00.000Z');
    const { processor, tx, schedulerLocks, invoices } = createProcessor([
      { id: 'sub-1', tenantId: 'tenant-1' },
      { id: 'sub-2', tenantId: 'tenant-2' },
    ]);

    const result = await processor.runInvoiceRun(now);

    expect(schedulerLocks.runExclusive).toHaveBeenCalledWith(
      'billing.invoice-run',
      600000,
      expect.any(Function),
      { skipped: true, scanned: 0, generated: 0, failed: 0, failures: [] },
    );
    expect(tx.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['ACTIVE', 'PAST_DUE'] },
          nextBillingAt: { lte: now },
          deletedAt: null,
        }),
      }),
    );
    expect(invoices.generateInvoice).toHaveBeenCalledTimes(2);
    expect(invoices.generateInvoice).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      subscriptionId: 'sub-1',
      now,
    });
    expect(result).toEqual({
      skipped: false,
      scanned: 2,
      generated: 2,
      failed: 0,
      failures: [],
    });
  });

  it('continues generating invoices when one tenant fails', async () => {
    const now = new Date('2026-07-01T00:00:00.000Z');
    const { processor, invoices } = createProcessor([
      { id: 'sub-1', tenantId: 'tenant-1' },
      { id: 'sub-2', tenantId: 'tenant-2' },
      { id: 'sub-3', tenantId: 'tenant-3' },
    ]);
    invoices.generateInvoice
      .mockResolvedValueOnce({ id: 'inv-1' } as any)
      .mockRejectedValueOnce(new Error('billing exploded'))
      .mockResolvedValueOnce({ id: 'inv-3' } as any);

    await expect(processor.runInvoiceRun(now)).resolves.toEqual({
      skipped: false,
      scanned: 3,
      generated: 2,
      failed: 1,
      failures: [
        {
          tenantId: 'tenant-2',
          subscriptionId: 'sub-2',
          message: 'billing exploded',
        },
      ],
    });
    expect(invoices.generateInvoice).toHaveBeenCalledTimes(3);
  });

  it('skips when another instance holds the lock', async () => {
    const { processor, tx, schedulerLocks, invoices } = createProcessor([
      { id: 'sub-1', tenantId: 'tenant-1' },
    ]);
    schedulerLocks.runExclusive.mockResolvedValueOnce({
      skipped: true,
      scanned: 0,
      generated: 0,
      failed: 0,
      failures: [],
    });

    await expect(processor.runInvoiceRun()).resolves.toEqual({
      skipped: true,
      scanned: 0,
      generated: 0,
      failed: 0,
      failures: [],
    });
    expect(tx.subscription.findMany).not.toHaveBeenCalled();
    expect(invoices.generateInvoice).not.toHaveBeenCalled();
  });
});
