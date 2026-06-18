import { Injectable } from '@nestjs/common';
import { MetricsService } from '../observability/metrics.service';
import { RedisLockService } from '../redis/redis-lock.service';

@Injectable()
export class ScheduledLockService {
  constructor(
    private readonly locks: RedisLockService,
    private readonly metrics: MetricsService,
  ) {}

  async runExclusive<T>(
    name: string,
    ttlMs: number,
    fn: () => Promise<T>,
    skippedResult: T,
  ): Promise<T> {
    const key = RedisLockService.key('scheduler', name);
    const lock = await this.locks.acquire(key, ttlMs);
    if (!lock.ok) {
      this.metrics.recordScheduledJobSkipped(name);
      return skippedResult;
    }

    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }
}
