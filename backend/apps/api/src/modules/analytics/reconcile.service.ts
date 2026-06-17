import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';

interface RecomputeDayInput {
  tenantId: string;
  stationId: string;
  date: Date;
}

type RecomputedMetrics = Record<string, number>;

@Injectable()
export class ReconcileService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async recomputeDay(input: RecomputeDayInput) {
    const start = this.dateOnly(input.date);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const metrics = await this.tenantPrisma.withTenant(async (tx) => {
      const [inbound, pickup, stored, exception, shipPaid, gmv] =
        await Promise.all([
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
        ]);
      const values: RecomputedMetrics = {
        inbound,
        pickup,
        stored_snapshot: stored,
        exception,
        ship_paid: shipPaid,
        ship_gmv: Number(gmv._sum.quoteAmount ?? 0),
      };

      for (const [metric, value] of Object.entries(values)) {
        const storedValue = BigInt(value);
        await tx.metricDaily.upsert({
          where: {
            tenantId_stationId_statDate_metric: {
              tenantId: input.tenantId,
              stationId: input.stationId,
              statDate: start,
              metric,
            },
          },
          update: { value: storedValue },
          create: {
            tenantId: input.tenantId,
            stationId: input.stationId,
            statDate: start,
            metric,
            value: storedValue,
          },
        });
      }
      return values;
    });

    return metrics;
  }

  private dateOnly(value: Date) {
    return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
  }
}
