import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { analyticsKeys } from './keys';

interface OverviewInput {
  tenantId: string;
  stationId: string;
  date?: Date;
}

interface TrendInput {
  tenantId: string;
  stationId?: string;
  metric: string;
  from: Date;
  to: Date;
}

interface HeatmapInput {
  tenantId: string;
  stationId: string;
}

interface MetricDailyRow {
  statDate: Date;
  value: bigint | number;
}

@Injectable()
export class QueryService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly redis: RedisService,
  ) {}

  async overview(input: OverviewInput) {
    const date = input.date ?? new Date();
    const dateKey = this.toDateKey(date);
    const client = this.redis.getClient();
    const [counts, storedValue] = await Promise.all([
      client.hgetall(
        analyticsKeys.count(input.tenantId, input.stationId, dateKey),
      ),
      client.get(analyticsKeys.stored(input.tenantId, input.stationId)),
    ]);

    const inbound = Number(counts.inbound ?? 0);
    const pickup = Number(counts.pickup ?? 0);
    const stored = Number(storedValue ?? 0);
    const denominator = pickup + stored;

    return {
      inbound,
      pickup,
      stored,
      inboundToday: inbound,
      pickedToday: pickup,
      inStock: stored,
      pickupRate: denominator ? Math.round((pickup / denominator) * 100) : 0,
      overdueCount: Number(counts.overdue ?? 0),
      exceptionCount: Number(counts.exception ?? 0),
      shipPaid: Number(counts.ship_paid ?? 0),
      gmv: Number(counts.ship_gmv ?? 0),
      notifyToday: 0,
    };
  }

  async trend(input: TrendInput) {
    const rows = await this.tenantPrisma.withTenant<MetricDailyRow[]>((tx) =>
      tx.metricDaily.findMany({
        where: {
          tenantId: input.tenantId,
          stationId: input.stationId,
          metric: input.metric,
          statDate: {
            gte: this.dateOnly(input.from),
            lte: this.dateOnly(input.to),
          },
        },
        orderBy: { statDate: 'asc' },
      }),
    );
    const byDate = new Map(
      rows.map((row) => [this.toDateKey(row.statDate), Number(row.value)]),
    );

    return {
      metric: input.metric,
      points: this.dateRange(input.from, input.to).map((date) => ({
        date,
        value: byDate.get(date) ?? 0,
      })),
    };
  }

  async heatmap(input: HeatmapInput) {
    return this.tenantPrisma.withTenant(async (tx) => {
      const shelves = await tx.shelf.findMany({
        where: {
          tenantId: input.tenantId,
          stationId: input.stationId,
          deletedAt: null,
        },
        include: { slots: { select: { id: true } } },
        orderBy: { code: 'asc' },
      });
      const occupied = await tx.slot.groupBy({
        by: ['shelfId'],
        where: {
          tenantId: input.tenantId,
          stationId: input.stationId,
          status: 'OCCUPIED',
          deletedAt: null,
        },
        _count: { _all: true },
      });
      const usedByShelf = new Map(
        occupied.map((item: any) => [item.shelfId, item._count._all]),
      );

      return {
        shelves: shelves.map((shelf: any) => {
          const capacity = shelf.slots.length;
          const used = Number(usedByShelf.get(shelf.id) ?? 0);
          return {
            shelfCode: shelf.code,
            used,
            capacity,
            rate: capacity ? Math.round((used / capacity) * 100) / 100 : 0,
          };
        }),
      };
    });
  }

  private dateOnly(value: Date) {
    return new Date(`${this.toDateKey(value)}T00:00:00.000Z`);
  }

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private dateRange(from: Date, to: Date) {
    const out: string[] = [];
    const cursor = this.dateOnly(from);
    const end = this.dateOnly(to);
    while (cursor.getTime() <= end.getTime()) {
      out.push(this.toDateKey(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
  }
}
