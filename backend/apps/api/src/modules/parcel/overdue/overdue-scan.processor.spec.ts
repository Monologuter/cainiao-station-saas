import { EventBus } from '../../../core/event-bus/event-bus';
import { ScheduledLockService } from '../../../core/scheduler-lock/scheduler-lock.service';
import { ParcelService } from '../parcel.service';
import { OverdueScanProcessor } from './overdue-scan.processor';

const NOW = new Date('2026-06-18T00:00:00.000Z');

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function createProcessor(parcels: any[]) {
  const tx = {
    $executeRawUnsafe: jest.fn(),
    parcel: {
      findMany: jest.fn().mockResolvedValue(parcels),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: any) => fn(tx)),
  } as any;
  const schedulerLocks = {
    runExclusive: jest.fn((_name, _ttl, fn) => fn()),
  } as unknown as jest.Mocked<ScheduledLockService>;
  const eventBus = {
    publish: jest.fn(),
  } as unknown as jest.Mocked<EventBus>;
  const parcelService = {
    returnParcel: jest.fn(),
  } as unknown as jest.Mocked<ParcelService>;

  return {
    processor: new OverdueScanProcessor(
      prisma,
      schedulerLocks,
      eventBus,
      parcelService,
    ),
    tx,
    schedulerLocks,
    eventBus,
    parcelService,
  };
}

describe('OverdueScanProcessor', () => {
  it('upgrades stored parcels by overdue level and publishes only higher levels', async () => {
    const { processor, tx, eventBus } = createProcessor([
      {
        id: 'p1',
        tenantId: 't1',
        stationId: 's1',
        storedAt: daysAgo(3),
        lastOverdueLevel: 0,
      },
      {
        id: 'p2',
        tenantId: 't1',
        stationId: 's1',
        storedAt: daysAgo(7),
        lastOverdueLevel: 1,
      },
      {
        id: 'p3',
        tenantId: 't2',
        stationId: 's2',
        storedAt: daysAgo(11),
        lastOverdueLevel: 2,
      },
      {
        id: 'p4',
        tenantId: 't2',
        stationId: 's2',
        storedAt: daysAgo(7),
        lastOverdueLevel: 2,
      },
    ]);

    const result = await processor.runOverdueScan(NOW);

    expect(result).toMatchObject({
      skipped: false,
      scanned: 4,
      upgraded: 3,
      returned: 0,
      levels: { 1: 1, 2: 1, 3: 1 },
    });
    expect(tx.parcel.updateMany).toHaveBeenCalledTimes(3);
    expect(tx.parcel.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', status: 'STORED', lastOverdueLevel: { lt: 1 } },
      data: { lastOverdueLevel: 1 },
    });
    expect(eventBus.publish).toHaveBeenCalledTimes(3);
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ParcelOverdueDetected',
        payload: expect.objectContaining({
          tenantId: 't1',
          parcelId: 'p1',
          stationId: 's1',
          level: 1,
          daysOverdue: 3,
        }),
      }),
    );
  });

  it('does not republish when parcel remains at the same overdue level', async () => {
    const { processor, tx, eventBus } = createProcessor([
      {
        id: 'p1',
        tenantId: 't1',
        stationId: 's1',
        storedAt: daysAgo(6),
        lastOverdueLevel: 1,
      },
    ]);

    const result = await processor.runOverdueScan(NOW);

    expect(result.upgraded).toBe(0);
    expect(tx.parcel.updateMany).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('returns parcels that reach return threshold', async () => {
    const { processor, eventBus, parcelService } = createProcessor([
      {
        id: 'p1',
        tenantId: 't1',
        stationId: 's1',
        storedAt: daysAgo(15),
        lastOverdueLevel: 3,
      },
    ]);

    const result = await processor.runOverdueScan(NOW);

    expect(result.returned).toBe(1);
    expect(parcelService.returnParcel).toHaveBeenCalledWith('p1', {
      cause: 'OVERDUE',
      reason: '滞留自动退回',
    });
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('skips scanning when lock is not acquired', async () => {
    const { processor, tx, schedulerLocks, eventBus, parcelService } =
      createProcessor([
        {
          id: 'p1',
          tenantId: 't1',
          stationId: 's1',
          storedAt: daysAgo(15),
          lastOverdueLevel: 3,
        },
      ]);
    schedulerLocks.runExclusive.mockResolvedValueOnce({
      skipped: true,
      scanned: 0,
      upgraded: 0,
      returned: 0,
      levels: { 1: 0, 2: 0, 3: 0 },
    });

    const result = await processor.runOverdueScan(NOW);

    expect(result).toMatchObject({ skipped: true, scanned: 0 });
    expect(tx.parcel.findMany).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(parcelService.returnParcel).not.toHaveBeenCalled();
  });
});
