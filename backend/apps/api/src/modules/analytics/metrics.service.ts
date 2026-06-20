import { Injectable, Optional } from '@nestjs/common';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { RedisService } from '../../core/redis/redis.service';
import { ANALYTICS_KEY_TTL_SECONDS, analyticsKeys } from './keys';

export interface IncrementMetricInput {
  tenantId: string;
  stationId: string;
  metric: string;
  by?: number;
  eventId: string;
  at: Date;
}

export interface AdjustStoredInput {
  tenantId: string;
  stationId: string;
  delta: 1 | -1;
}

export interface OverdueCandidateInput {
  tenantId: string;
  stationId: string;
  parcelId: string;
  at: Date;
}

export interface HeatInput {
  tenantId: string;
  stationId: string;
  shelfCode: string;
  delta: 1 | -1;
}

@Injectable()
export class MetricsService {
  constructor(
    private readonly redis: RedisService,
    @Optional() private readonly tenantPrisma?: TenantPrismaService,
  ) {}

  async incr(input: IncrementMetricInput) {
    const date = this.toDateKey(input.at);
    const dedupKey = analyticsKeys.dedup(date);
    const client = this.redis.getClient();
    const inserted = await client.sadd(dedupKey, input.eventId);
    await client.expire(dedupKey, ANALYTICS_KEY_TTL_SECONDS);
    if (inserted === 0) {
      return { skipped: true, value: null };
    }

    const by = input.by ?? 1;
    const countKey = analyticsKeys.count(input.tenantId, input.stationId, date);
    const platformKey = analyticsKeys.platformCount(date);
    const stationRankKey = analyticsKeys.stationRank(
      input.tenantId,
      input.metric,
      date,
    );

    const value = await client.hincrby(countKey, input.metric, by);
    await Promise.all([
      client.expire(countKey, ANALYTICS_KEY_TTL_SECONDS),
      client.hincrby(platformKey, input.metric, by),
      client.expire(platformKey, ANALYTICS_KEY_TTL_SECONDS),
      client.zincrby(stationRankKey, by, input.stationId),
    ]);

    return { skipped: false, value };
  }

  async adjustStored(input: AdjustStoredInput) {
    const key = analyticsKeys.stored(input.tenantId, input.stationId);
    const value = await this.redis
      .getClient()
      .incrby(key, input.delta);
    if (value < 0) {
      await this.redis.getClient().set(key, 0);
      return 0;
    }
    return value;
  }

  addOverdueCandidate(input: OverdueCandidateInput) {
    return this.redis
      .getClient()
      .zadd(
        analyticsKeys.overdueRank(input.tenantId, input.stationId),
        input.at.getTime(),
        input.parcelId,
      );
  }

  removeOverdueCandidate(input: Omit<OverdueCandidateInput, 'at'>) {
    return this.redis
      .getClient()
      .zrem(
        analyticsKeys.overdueRank(input.tenantId, input.stationId),
        input.parcelId,
      );
  }

  async adjustHeat(input: HeatInput) {
    const key = analyticsKeys.heat(input.tenantId, input.stationId);
    const value = await this.redis
      .getClient()
      .hincrby(key, input.shelfCode, input.delta);
    if (value < 0) {
      await this.redis.getClient().hset(key, input.shelfCode, 0);
      return 0;
    }
    return value;
  }

  async adjustHeatBySlotId(input: {
    tenantId: string;
    stationId: string;
    slotId?: string | null;
    delta: 1 | -1;
  }) {
    if (!input.slotId || !this.tenantPrisma) {
      return 0;
    }
    const slot = await this.tenantPrisma.withTenant<any>((tx) =>
      tx.slot.findFirst({
        where: {
          id: input.slotId,
          tenantId: input.tenantId,
          stationId: input.stationId,
        },
        select: { code: true },
      }),
    );
    const shelfCode = this.shelfCode(slot?.code);
    if (!shelfCode) {
      return 0;
    }
    return this.adjustHeat({
      tenantId: input.tenantId,
      stationId: input.stationId,
      shelfCode,
      delta: input.delta,
    });
  }

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private shelfCode(slotCode?: string | null) {
    return slotCode?.split('-')[0] || null;
  }
}
