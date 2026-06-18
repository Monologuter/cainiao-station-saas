import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../../core/http/api-code';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { calculateStoreHealth } from './store-health.calculator';

const EXCEPTION_WARN_THRESHOLD = 10;

@Injectable()
export class MonitorService {
  constructor(private readonly prisma: PrismaService) {}

  overview() {
    return this.withBypass(async (tx) => {
      const [tenants, stations, inStockParcels, exceptionCount, gmv] =
        await Promise.all([
          tx.tenant.count(),
          tx.station.count(),
          tx.parcel.count({ where: { status: 'STORED', deletedAt: null } }),
          tx.exceptionTicket.count({
            where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, deletedAt: null },
          }),
          tx.shipOrder.aggregate({
            where: { paidAt: { not: null }, deletedAt: null },
            _sum: { quoteAmount: true },
          }),
        ]);

      return {
        tenants,
        stations,
        inStockParcels,
        exceptionCount,
        gmv: Number(gmv._sum.quoteAmount ?? 0),
      };
    });
  }

  async stores(input: { page: number; pageSize: number }) {
    return this.withBypass(async (tx) => {
      const [total, stations] = await Promise.all([
        tx.station.count(),
        tx.station.findMany({
          include: { tenant: true },
          orderBy: { createdAt: 'desc' },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
      ]);
      const items = await Promise.all(
        stations.map((station: any) => this.stationSummary(tx, station)),
      );
      return {
        total,
        page: input.page,
        pageSize: input.pageSize,
        items,
      };
    });
  }

  async storeDetail(stationId: string) {
    return this.withBypass(async (tx) => {
      const station = await tx.station.findUnique({
        where: { id: stationId },
        include: { tenant: true },
      });
      if (!station) {
        throw new BizError(ApiCode.NOT_FOUND, '门店不存在');
      }
      return this.stationSummary(tx, station);
    });
  }

  private async stationSummary(tx: any, station: any) {
    const [inStockParcels, exceptionCount, gmv, subscription] =
      await Promise.all([
        tx.parcel.count({
          where: {
            tenantId: station.tenantId,
            stationId: station.id,
            status: 'STORED',
            deletedAt: null,
          },
        }),
        tx.exceptionTicket.count({
          where: {
            tenantId: station.tenantId,
            stationId: station.id,
            status: { in: ['OPEN', 'IN_PROGRESS'] },
            deletedAt: null,
          },
        }),
        tx.shipOrder.aggregate({
          where: {
            tenantId: station.tenantId,
            stationId: station.id,
            paidAt: { not: null },
            deletedAt: null,
          },
          _sum: { quoteAmount: true },
        }),
        tx.subscription.findFirst({
          where: {
            tenantId: station.tenantId,
            OR: [{ stationId: station.id }, { stationId: null }],
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    const metrics = {
      inStockParcels,
      exceptionCount,
      gmv: Number(gmv._sum.quoteAmount ?? 0),
    };
    const online = true;

    return {
      tenantId: station.tenantId,
      tenantName: station.tenant?.name,
      stationId: station.id,
      stationName: station.name,
      stationCode: station.code,
      online,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            currentPeriodEnd: subscription.currentPeriodEnd,
          }
        : null,
      health: calculateStoreHealth({
        online,
        subscriptionStatus: subscription?.status,
        exceptionCount,
        exceptionWarnThreshold: EXCEPTION_WARN_THRESHOLD,
      }),
      metrics,
    };
  }

  private async withBypass<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return fn(tx);
    });
  }
}
