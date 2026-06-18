import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ScheduledLockService } from '../../core/scheduler-lock/scheduler-lock.service';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { ForecastService } from './forecast.service';

const FORECAST_JOB_NAME = 'analytics.volume-forecast';
const FORECAST_LOCK_TTL_MS = 10 * 60 * 1000;
const FORECAST_BATCH_SIZE = 500;
const SYSTEM_OPERATOR_ID = '00000000-0000-0000-0000-000000000000';

export interface ForecastRunJobResult {
  skipped: boolean;
  stations: number;
  forecasts: number;
  actuals: number;
}

@Injectable()
export class ForecastProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerLocks: ScheduledLockService,
    private readonly forecasts: ForecastService,
  ) {}

  async runDailyForecast(now = new Date()): Promise<ForecastRunJobResult> {
    return this.schedulerLocks.runExclusive(
      FORECAST_JOB_NAME,
      FORECAST_LOCK_TTL_MS,
      () => this.runForStations(now),
      this.emptyResult(true),
    );
  }

  private async runForStations(now: Date): Promise<ForecastRunJobResult> {
    const stations = await this.withBypass<any[]>((tx) =>
      tx.station.findMany({
        where: { deletedAt: null },
        select: { id: true, tenantId: true },
        orderBy: { createdAt: 'asc' },
        take: FORECAST_BATCH_SIZE,
      }),
    );

    let forecastCount = 0;
    for (const station of stations) {
      await TenantContext.run(
        {
          tenantId: station.tenantId,
          userId: SYSTEM_OPERATOR_ID,
          roles: ['system'],
          isPlatform: false,
        },
        async () => {
          await this.forecasts.run({
            tenantId: station.tenantId,
            stationId: station.id,
            horizon: 7,
            granularity: 'DAY',
          });
          await this.forecasts.run({
            tenantId: station.tenantId,
            stationId: station.id,
            horizon: 1,
            granularity: 'HOUR',
          });
        },
      );
      forecastCount += 2;
    }

    const actuals = await this.backfillYesterdayActuals(now);
    return {
      skipped: false,
      stations: stations.length,
      forecasts: forecastCount,
      actuals,
    };
  }

  private async backfillYesterdayActuals(now: Date) {
    const yesterday = this.dateOnly(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const metrics = await this.withBypass<any[]>((tx) =>
      tx.metricDaily.findMany({
        where: {
          metric: 'inbound',
          statDate: yesterday,
        },
      }),
    );

    let updated = 0;
    for (const metric of metrics) {
      const result = await this.withBypass<{ count: number }>((tx) =>
        tx.volumeForecast.updateMany({
          where: {
            tenantId: metric.tenantId,
            stationId: metric.stationId,
            targetDate: yesterday,
          },
          data: { actualVolume: Number(metric.value) },
        }),
      );
      updated += result.count > 0 ? 1 : 0;
    }
    return updated;
  }

  private async withBypass<T>(fn: (tx: any) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return fn(tx);
    });
  }

  private dateOnly(date: Date) {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private emptyResult(skipped: boolean): ForecastRunJobResult {
    return { skipped, stations: 0, forecasts: 0, actuals: 0 };
  }
}
