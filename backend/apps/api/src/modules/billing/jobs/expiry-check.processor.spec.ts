import { EventBus } from '../../../core/event-bus/event-bus';
import { RedisLockService } from '../../../core/redis/redis-lock.service';
import { ExpiryCheckProcessor } from './expiry-check.processor';

function createProcessor() {
  const overdueInvoices = [
    { id: 'inv-1', tenantId: 'tenant-1', subscriptionId: 'sub-1' },
  ];
  const suspendInvoices = [
    {
      id: 'inv-2',
      tenantId: 'tenant-2',
      subscriptionId: 'sub-2',
      tenant: { status: 'ACTIVE' },
    },
  ];
  const tx = {
    $executeRawUnsafe: jest.fn(),
    invoice: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(overdueInvoices)
        .mockResolvedValueOnce(suspendInvoices),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    subscription: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    tenant: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) } as any;
  const release = jest.fn();
  const locks = {
    acquire: jest.fn().mockResolvedValue({ ok: true, release }),
  } as unknown as jest.Mocked<RedisLockService>;
  const eventBus = { publish: jest.fn() } as unknown as jest.Mocked<EventBus>;
  return {
    processor: new ExpiryCheckProcessor(prisma, locks, eventBus),
    tx,
    eventBus,
  };
}

describe('ExpiryCheckProcessor', () => {
  it('marks overdue invoices and suspends tenants after grace period', async () => {
    const now = new Date('2026-07-15T00:00:00.000Z');
    const { processor, tx, eventBus } = createProcessor();

    const result = await processor.runExpiryCheck(now);

    expect(tx.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', status: 'OPEN' },
      data: { status: 'OVERDUE' },
    });
    expect(tx.subscription.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub-1', status: 'ACTIVE' },
      data: { status: 'PAST_DUE' },
    });
    expect(tx.subscription.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub-2', status: { in: ['ACTIVE', 'PAST_DUE'] } },
      data: { status: 'SUSPENDED' },
    });
    expect(tx.tenant.updateMany).toHaveBeenCalledWith({
      where: { id: 'tenant-2', status: 'ACTIVE' },
      data: { status: 'SUSPENDED' },
    });
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'TenantStatusChanged',
        payload: expect.objectContaining({
          tenantId: 'tenant-2',
          status: 'SUSPENDED',
          reason: 'OVERDUE',
        }),
      }),
    );
    expect(result).toEqual({ skipped: false, overdue: 1, suspended: 1 });
  });

  it('restores an overdue-suspended tenant after all overdue invoices are cleared', async () => {
    const { processor, tx, eventBus } = createProcessor();

    const result = await processor.restoreTenantIfCleared('tenant-2');

    expect(tx.invoice.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-2',
        status: { in: ['OPEN', 'OVERDUE'] },
        deletedAt: null,
      },
    });
    expect(tx.tenant.updateMany).toHaveBeenCalledWith({
      where: { id: 'tenant-2', status: 'SUSPENDED' },
      data: { status: 'ACTIVE' },
    });
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'TenantStatusChanged',
        payload: expect.objectContaining({
          tenantId: 'tenant-2',
          status: 'ACTIVE',
          reason: 'OVERDUE_CLEARED',
        }),
      }),
    );
    expect(result).toEqual({ restored: true });
  });
});
