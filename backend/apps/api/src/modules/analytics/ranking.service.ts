import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { analyticsKeys } from './keys';

@Injectable()
export class RankingService {
  constructor(
    private readonly redis: RedisService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  async overdueTop(input: {
    tenantId: string;
    stationId: string;
    limit: number;
  }) {
    const raw = await this.redis
      .getClient()
      .zrange(
        analyticsKeys.overdueRank(input.tenantId, input.stationId),
        0,
        input.limit - 1,
        'WITHSCORES',
      );
    return {
      type: 'overdue',
      items: this.toPairs(raw).map(([key, value]) => ({
        key,
        label: key,
        value,
        extra: {},
      })),
    };
  }

  async stationCompare(input: {
    tenantId: string;
    metric: string;
    date: Date;
    limit?: number;
  }) {
    const dateKey = input.date.toISOString().slice(0, 10);
    const raw = await this.redis
      .getClient()
      .zrevrange(
        analyticsKeys.stationRank(input.tenantId, input.metric, dateKey),
        0,
        (input.limit ?? 10) - 1,
        'WITHSCORES',
      );
    return {
      metric: input.metric,
      rows: this.toPairs(raw).map(([stationId, value]) => ({
        stationId,
        name: stationId,
        value,
      })),
    };
  }

  private toPairs(raw: string[]) {
    const pairs: Array<[string, number]> = [];
    for (let index = 0; index < raw.length; index += 2) {
      pairs.push([raw[index], Number(raw[index + 1])]);
    }
    return pairs;
  }
}
