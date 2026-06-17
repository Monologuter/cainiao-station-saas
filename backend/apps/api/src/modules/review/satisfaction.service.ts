import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';

interface SummaryQuery {
  stationId?: string;
  from: string | Date;
  to: string | Date;
}

@Injectable()
export class SatisfactionService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async summary(tenantId: string, query: SummaryQuery) {
    const from = this.startOfDay(query.from);
    const to = this.endOfDay(query.to);
    const where = {
      tenantId,
      stationId: query.stationId,
      createdAt: { gte: from, lte: to },
      deletedAt: null,
    };

    return this.tenantPrisma.withTenant(async (tx) => {
      const [reviews, complaintCount, pickupCount] = await Promise.all([
        tx.review.findMany({
          where,
          select: { rating: true, createdAt: true },
        }),
        tx.complaint.count({ where }),
        tx.parcel.count({
          where: {
            tenantId,
            stationId: query.stationId,
            status: 'PICKED_UP',
            pickedUpAt: { gte: from, lte: to },
          },
        }),
      ]);

      const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      const trendMap = new Map<string, { total: number; count: number }>();
      let totalRating = 0;
      for (const review of reviews) {
        totalRating += review.rating;
        ratingDist[review.rating as 1 | 2 | 3 | 4 | 5] += 1;
        const key = review.createdAt.toISOString().slice(0, 10);
        const prev = trendMap.get(key) ?? { total: 0, count: 0 };
        trendMap.set(key, {
          total: prev.total + review.rating,
          count: prev.count + 1,
        });
      }

      const trend = Array.from(trendMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, item]) => ({
          date,
          avgRating: this.round(item.total / item.count),
          reviewCount: item.count,
        }));

      return {
        avgRating: reviews.length
          ? this.round(totalRating / reviews.length)
          : 0,
        reviewCount: reviews.length,
        ratingDist,
        complaintCount,
        pickupCount,
        complaintRate: pickupCount
          ? this.round(complaintCount / pickupCount)
          : 0,
        trend,
      };
    });
  }

  private startOfDay(value: string | Date) {
    const date = new Date(value);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }

  private endOfDay(value: string | Date) {
    const date = new Date(value);
    date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  private round(value: number) {
    return Math.round(value * 100) / 100;
  }
}
