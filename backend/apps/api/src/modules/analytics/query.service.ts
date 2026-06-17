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
    const hasHotCounters =
      Object.keys(counts).length > 0 || storedValue !== null;

    if (!hasHotCounters) {
      return this.overviewFromDetail(input, date);
    }

    const [notifyToday, storedFallback] = await Promise.all([
      this.countNotifications(input, date),
      storedValue === null ? this.countStored(input) : Promise.resolve(null),
    ]);

    const inbound = Number(counts.inbound ?? 0);
    const pickup = Number(counts.pickup ?? 0);
    const stored = Number(storedValue ?? storedFallback ?? 0);
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
      notifyToday,
    };
  }

  async resolveStationId(tenantId: string, stationId?: string) {
    if (stationId) {
      return stationId;
    }
    const station = await this.tenantPrisma.withTenant<{ id: string } | null>(
      (tx) =>
        tx.station.findFirst({
          where: { tenantId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        }),
    );
    return station?.id;
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

  async platformOverview(date = new Date()) {
    const dateKey = this.toDateKey(date);
    const hotCounts = await this.redis
      .getClient()
      .hgetall(analyticsKeys.platformCount(dateKey));
    const { start, end } = this.dayBounds(date);

    return this.tenantPrisma.withTenant(async (tx) => {
      const [tenants, stations, parcels, shipGmv] = await Promise.all([
        tx.tenant.count(),
        tx.station.count(),
        tx.parcel.count(),
        tx.shipOrder.aggregate({
          where: { paidAt: { gte: start, lt: end } },
          _sum: { quoteAmount: true },
        }),
      ]);

      return {
        tenants,
        stations,
        parcels,
        inbound: Number(hotCounts.inbound ?? 0),
        pickup: Number(hotCounts.pickup ?? 0),
        shipPaid: Number(hotCounts.ship_paid ?? 0),
        gmv: Number(hotCounts.ship_gmv ?? shipGmv._sum.quoteAmount ?? 0),
      };
    });
  }

  async platformTenantCompare(input: {
    metric: string;
    date?: Date;
    limit?: number;
  }) {
    const statDate = this.dateOnly(input.date ?? new Date());
    return this.tenantPrisma.withTenant(async (tx) => {
      const rows = await tx.metricDaily.groupBy({
        by: ['tenantId'],
        where: {
          metric: input.metric,
          statDate,
        },
        _sum: { value: true },
        orderBy: { _sum: { value: 'desc' } },
        take: input.limit ?? 10,
      });
      const tenants = await tx.tenant.findMany({
        where: { id: { in: rows.map((row: any) => row.tenantId) } },
        select: { id: true, name: true },
      });
      const names = new Map(
        tenants.map((tenant: any) => [tenant.id, tenant.name]),
      );

      return {
        metric: input.metric,
        rows: rows.map((row: any) => ({
          tenantId: row.tenantId,
          name: names.get(row.tenantId) ?? row.tenantId,
          value: Number(row._sum.value ?? 0),
        })),
      };
    });
  }

  private overviewFromDetail(input: OverviewInput, date: Date) {
    const { start, end } = this.dayBounds(date);
    const overdueBefore = new Date(date);
    overdueBefore.setUTCDate(overdueBefore.getUTCDate() - 3);

    return this.tenantPrisma.withTenant(async (tx) => {
      const [
        inbound,
        pickup,
        stored,
        overdueCount,
        exceptionCount,
        shipPaid,
        gmv,
        notifyToday,
      ] = await Promise.all([
        tx.parcel.count({
          where: {
            tenantId: input.tenantId,
            stationId: input.stationId,
            storedAt: { gte: start, lt: end },
          },
        }),
        tx.parcel.count({
          where: {
            tenantId: input.tenantId,
            stationId: input.stationId,
            pickedUpAt: { gte: start, lt: end },
          },
        }),
        tx.parcel.count({
          where: {
            tenantId: input.tenantId,
            stationId: input.stationId,
            status: 'STORED',
          },
        }),
        tx.parcel.count({
          where: {
            tenantId: input.tenantId,
            stationId: input.stationId,
            status: 'STORED',
            storedAt: { lt: overdueBefore },
          },
        }),
        tx.parcel.count({
          where: {
            tenantId: input.tenantId,
            stationId: input.stationId,
            status: 'EXCEPTION',
          },
        }),
        tx.shipOrder.count({
          where: {
            tenantId: input.tenantId,
            stationId: input.stationId,
            paidAt: { gte: start, lt: end },
          },
        }),
        tx.shipOrder.aggregate({
          where: {
            tenantId: input.tenantId,
            stationId: input.stationId,
            paidAt: { gte: start, lt: end },
          },
          _sum: { quoteAmount: true },
        }),
        tx.notification.count({
          where: {
            tenantId: input.tenantId,
            createdAt: { gte: start, lt: end },
          },
        }),
      ]);
      const denominator = pickup + stored;
      return {
        inbound,
        pickup,
        stored,
        inboundToday: inbound,
        pickedToday: pickup,
        inStock: stored,
        pickupRate: denominator ? Math.round((pickup / denominator) * 100) : 0,
        overdueCount,
        exceptionCount,
        shipPaid,
        gmv: Number(gmv._sum.quoteAmount ?? 0),
        notifyToday,
      };
    });
  }

  private countNotifications(input: OverviewInput, date: Date) {
    const { start, end } = this.dayBounds(date);
    return this.tenantPrisma.withTenant((tx) =>
      tx.notification.count({
        where: {
          tenantId: input.tenantId,
          createdAt: { gte: start, lt: end },
        },
      }),
    );
  }

  private countStored(input: OverviewInput) {
    return this.tenantPrisma.withTenant((tx) =>
      tx.parcel.count({
        where: {
          tenantId: input.tenantId,
          stationId: input.stationId,
          status: 'STORED',
        },
      }),
    );
  }

  private dayBounds(date: Date) {
    const start = this.dateOnly(date);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
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
