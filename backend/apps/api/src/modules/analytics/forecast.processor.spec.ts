import { ScheduledLockService } from '../../core/scheduler-lock/scheduler-lock.service';
import { ForecastProcessor } from './forecast.processor';
import { ForecastService } from './forecast.service';

function createProcessor(stations: any[], metrics: any[] = []) {
  const tx = {
    $executeRawUnsafe: jest.fn(),
    station: {
      findMany: jest.fn().mockResolvedValue(stations),
    },
    metricDaily: {
      findMany: jest.fn().mockResolvedValue(metrics),
    },
    volumeForecast: {
      updateMany: jest.fn().mockResolvedValue({ count: metrics.length }),
    },
  };
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) } as any;
  const schedulerLocks = {
    runExclusive: jest.fn((_name, _ttl, fn) => fn()),
  } as unknown as jest.Mocked<ScheduledLockService>;
  const forecasts = {
    run: jest.fn().mockResolvedValue({ forecasts: [] }),
  } as unknown as jest.Mocked<ForecastService>;

  return {
    processor: new ForecastProcessor(prisma, schedulerLocks, forecasts),
    tx,
    schedulerLocks,
    forecasts,
  };
}

describe('ForecastProcessor', () => {
  it('runs daily day/hour forecasts for active stations and backfills yesterday actuals under lock', async () => {
    const now = new Date('2026-06-18T02:00:00.000Z');
    const { processor, tx, schedulerLocks, forecasts } = createProcessor(
      [
        { id: 's1', tenantId: 't1' },
        { id: 's2', tenantId: 't2' },
      ],
      [
        {
          tenantId: 't1',
          stationId: 's1',
          statDate: new Date('2026-06-17T00:00:00.000Z'),
          value: 42,
        },
      ],
    );

    const result = await processor.runDailyForecast(now);

    expect(schedulerLocks.runExclusive).toHaveBeenCalledWith(
      'analytics.volume-forecast',
      600000,
      expect.any(Function),
      { skipped: true, stations: 0, forecasts: 0, actuals: 0 },
    );
    expect(tx.station.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        select: { id: true, tenantId: true },
      }),
    );
    expect(forecasts.run).toHaveBeenCalledTimes(4);
    expect(forecasts.run).toHaveBeenCalledWith({
      tenantId: 't1',
      stationId: 's1',
      horizon: 7,
      granularity: 'DAY',
    });
    expect(forecasts.run).toHaveBeenCalledWith({
      tenantId: 't1',
      stationId: 's1',
      horizon: 1,
      granularity: 'HOUR',
    });
    expect(tx.metricDaily.findMany).toHaveBeenCalledWith({
      where: {
        metric: 'inbound',
        statDate: new Date('2026-06-17T00:00:00.000Z'),
      },
    });
    expect(tx.volumeForecast.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 't1',
        stationId: 's1',
        targetDate: new Date('2026-06-17T00:00:00.000Z'),
      },
      data: { actualVolume: 42 },
    });
    expect(result).toEqual({
      skipped: false,
      stations: 2,
      forecasts: 4,
      actuals: 1,
    });
  });

  it('skips when another instance holds the forecast lock', async () => {
    const { processor, tx, schedulerLocks, forecasts } = createProcessor([
      { id: 's1', tenantId: 't1' },
    ]);
    schedulerLocks.runExclusive.mockResolvedValueOnce({
      skipped: true,
      stations: 0,
      forecasts: 0,
      actuals: 0,
    });

    await expect(processor.runDailyForecast()).resolves.toEqual({
      skipped: true,
      stations: 0,
      forecasts: 0,
      actuals: 0,
    });
    expect(tx.station.findMany).not.toHaveBeenCalled();
    expect(forecasts.run).not.toHaveBeenCalled();
  });
});
