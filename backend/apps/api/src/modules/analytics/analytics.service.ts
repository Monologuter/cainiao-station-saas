import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';

const OVERDUE_DAYS = 3;

@Injectable()
export class AnalyticsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async overview() {
    const { startOfToday, overdueBefore } = this.bounds();

    return this.tenantPrisma.withTenant(async (tx) => {
      const [inboundToday, pickedToday, inStock, overdueCount, notifyToday] =
        await Promise.all([
          tx.parcel.count({
            where: { storedAt: { gte: startOfToday } },
          }),
          tx.parcel.count({
            where: { pickedUpAt: { gte: startOfToday } },
          }),
          tx.parcel.count({ where: { status: 'STORED' } }),
          tx.parcel.count({
            where: {
              status: 'STORED',
              storedAt: { lt: overdueBefore },
            },
          }),
          tx.notification.count({
            where: { createdAt: { gte: startOfToday } },
          }),
        ]);

      return {
        inboundToday,
        pickedToday,
        inStock,
        pickupRate: inboundToday
          ? Math.round((pickedToday / inboundToday) * 100)
          : 0,
        overdueCount,
        notifyToday,
      };
    });
  }

  private bounds() {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const overdueBefore = new Date(now);
    overdueBefore.setDate(overdueBefore.getDate() - OVERDUE_DAYS);

    return { startOfToday, overdueBefore };
  }
}
