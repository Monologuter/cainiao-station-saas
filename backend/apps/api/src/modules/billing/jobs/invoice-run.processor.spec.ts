import { RedisLockService } from '../../../core/redis/redis-lock.service';
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
  const release = jest.fn();
  const locks = {
    acquire: jest.fn().mockResolvedValue({ ok: true, release }),
  } as unknown as jest.Mocked<RedisLockService>;
  const invoices = {
    generateInvoice: jest.fn().mockResolvedValue({ id: 'inv-1' }),
  } as unknown as jest.Mocked<InvoiceService>;
  return {
    processor: new InvoiceRunProcessor(prisma, locks, invoices),
    tx,
    locks,
    invoices,
    release,
  };
}

describe('InvoiceRunProcessor', () => {
  it('scans due subscriptions under lock and generates invoices in tenant context', async () => {
    const now = new Date('2026-07-01T00:00:00.000Z');
    const { processor, tx, locks, invoices, release } = createProcessor([
      { id: 'sub-1', tenantId: 'tenant-1' },
      { id: 'sub-2', tenantId: 'tenant-2' },
    ]);

    const result = await processor.runInvoiceRun(now);

    expect(locks.acquire).toHaveBeenCalledWith(
      'lock:billing-invoice-run',
      600000,
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
    expect(release).toHaveBeenCalled();
    expect(result).toEqual({ skipped: false, scanned: 2, generated: 2 });
  });

  it('skips when another instance holds the lock', async () => {
    const { processor, tx, locks, invoices, release } = createProcessor([
      { id: 'sub-1', tenantId: 'tenant-1' },
    ]);
    locks.acquire.mockResolvedValueOnce({ ok: false, release });

    await expect(processor.runInvoiceRun()).resolves.toEqual({
      skipped: true,
      scanned: 0,
      generated: 0,
    });
    expect(tx.subscription.findMany).not.toHaveBeenCalled();
    expect(invoices.generateInvoice).not.toHaveBeenCalled();
  });
});
