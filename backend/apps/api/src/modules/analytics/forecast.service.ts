import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { ForecastClient, ForecastResponse } from './forecast.client';

interface RunForecastInput {
  tenantId: string;
  stationId: string;
  horizon?: number;
  granularity?: 'DAY' | 'HOUR';
}

interface ListForecastInput {
  tenantId: string;
  stationId: string;
  from: Date;
  to: Date;
  granularity: 'DAY' | 'HOUR';
}

@Injectable()
export class ForecastService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly client: ForecastClient,
  ) {}

  async run(input: RunForecastInput) {
    const granularity = input.granularity ?? 'DAY';
    const horizon = Math.min(Math.max(Number(input.horizon ?? 7), 1), 30);
    const history = await this.loadHistory(input.tenantId, input.stationId);
    const response =
      (await this.client.forecast({
        stationId: input.stationId,
        granularity,
        history,
        horizon,
      })) ?? this.localFallback(history, horizon, granularity);

    const generatedAt = new Date();
    const rows = response.forecasts.map((item) => ({
      tenantId: input.tenantId,
      stationId: input.stationId,
      targetDate: this.dateOnly(new Date(`${item.targetDate}T00:00:00.000Z`)),
      granularity,
      predictedVolume: item.predicted,
      hourBreakdown: item.hourBreakdown,
      method: response.method,
      lowerBound: item.lower,
      upperBound: item.upper,
      generatedAt,
    }));

    await this.tenantPrisma.withTenant((tx) =>
      tx.volumeForecast.createMany({ data: rows }),
    );

    return {
      stationId: input.stationId,
      granularity,
      method: response.method,
      forecasts: rows.map((row) => this.toDto(row)),
    };
  }

  async list(input: ListForecastInput) {
    const rows = await this.tenantPrisma.withTenant<any[]>((tx) =>
      tx.volumeForecast.findMany({
        where: {
          tenantId: input.tenantId,
          stationId: input.stationId,
          granularity: input.granularity,
          targetDate: {
            gte: this.dateOnly(input.from),
            lte: this.dateOnly(input.to),
          },
        },
        orderBy: [{ targetDate: 'asc' }, { generatedAt: 'desc' }],
      }),
    );
    const latest = new Map<string, any>();
    for (const row of rows) {
      const key = this.toDateKey(row.targetDate);
      if (!latest.has(key)) {
        latest.set(key, row);
      }
    }
    return { items: [...latest.values()].map((row) => this.toDto(row)) };
  }

  private async loadHistory(tenantId: string, stationId: string) {
    const rows = await this.tenantPrisma.withTenant<any[]>((tx) =>
      tx.metricDaily.findMany({
        where: {
          tenantId,
          stationId,
          metric: 'inbound',
        },
        orderBy: { statDate: 'asc' },
        take: 90,
      }),
    );
    return rows.map((row) => ({
      date: this.toDateKey(row.statDate),
      volume: Number(row.value),
    }));
  }

  private localFallback(
    history: Array<{ date: string; volume: number }>,
    horizon: number,
    granularity: 'DAY' | 'HOUR',
  ): ForecastResponse {
    const lastDate = history.length
      ? new Date(`${history[history.length - 1].date}T00:00:00.000Z`)
      : new Date();
    const predicted = this.weightedMovingAverage(history.slice(-7));
    const spread = Math.max(Math.round(predicted * 0.5), 0);
    return {
      method: 'FALLBACK_MEAN',
      forecasts: Array.from({ length: horizon }, (_, index) => {
        const target = new Date(lastDate);
        target.setUTCDate(lastDate.getUTCDate() + index + 1);
        return {
          targetDate: this.toDateKey(target),
          predicted,
          lower: Math.max(predicted - spread, 0),
          upper: predicted + spread,
          hourBreakdown:
            granularity === 'HOUR' ? this.hourFallback(predicted) : null,
        };
      }),
    };
  }

  private weightedMovingAverage(rows: Array<{ volume: number }>) {
    if (!rows.length) {
      return 0;
    }
    const weights = rows.map((_, index) => index + 1);
    const weighted = rows.reduce(
      (sum, row, index) => sum + row.volume * weights[index],
      0,
    );
    return Math.max(
      Math.round(weighted / weights.reduce((a, b) => a + b, 0)),
      0,
    );
  }

  private hourFallback(predicted: number) {
    const hours = Array(24).fill(0);
    hours[10] = predicted;
    return hours;
  }

  private toDto(row: any) {
    return {
      stationId: row.stationId,
      targetDate: this.toDateKey(row.targetDate),
      granularity: row.granularity,
      predictedVolume: row.predictedVolume,
      lowerBound: row.lowerBound,
      upperBound: row.upperBound,
      actualVolume: row.actualVolume,
      method: row.method,
      hourBreakdown: row.hourBreakdown,
      generatedAt: row.generatedAt,
    };
  }

  private dateOnly(date: Date) {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}
