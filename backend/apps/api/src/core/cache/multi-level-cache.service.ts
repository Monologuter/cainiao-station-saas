import { Injectable, Optional } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class MultiLevelCacheService {
  private readonly l1 = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(@Optional() private readonly redis?: RedisService) {}

  async getOrLoad<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
    nullTtlMs = 5000,
  ): Promise<T> {
    const l1 = this.l1.get(key);
    if (l1 && l1.expiresAt > Date.now()) {
      return l1.value as T;
    }

    const l2 = await this.getL2<T>(key);
    if (l2.hit) {
      this.setL1(key, l2.value, ttlMs);
      return l2.value as T;
    }

    if (this.inflight.has(key)) {
      return this.inflight.get(key) as Promise<T>;
    }

    const loading = this.loadAndFill(key, ttlMs, nullTtlMs, loader);
    this.inflight.set(key, loading);
    try {
      return await loading;
    } finally {
      this.inflight.delete(key);
    }
  }

  async invalidate(key: string) {
    this.l1.delete(key);
    const client = this.redis?.getClient();
    if (!client) return;
    try {
      await client.del(key);
      await client.publish('cache:invalidate', key);
    } catch {
      // Cache invalidation is best-effort; writers still committed source data.
    }
  }

  private async loadAndFill<T>(
    key: string,
    ttlMs: number,
    nullTtlMs: number,
    loader: () => Promise<T>,
  ) {
    const value = await loader();
    const ttl = value === null || value === undefined ? nullTtlMs : ttlMs;
    this.setL1(key, value, ttl);
    await this.setL2(key, value, ttl);
    return value;
  }

  private setL1(key: string, value: unknown, ttlMs: number) {
    this.l1.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  private async getL2<T>(key: string): Promise<{ hit: boolean; value?: T }> {
    const client = this.redis?.getClient();
    if (!client) return { hit: false };
    try {
      const raw = await client.get(key);
      if (!raw) return { hit: false };
      return { hit: true, value: JSON.parse(raw).value as T };
    } catch {
      return { hit: false };
    }
  }

  private async setL2(key: string, value: unknown, ttlMs: number) {
    const client = this.redis?.getClient();
    if (!client) return;
    try {
      await client.set(
        key,
        JSON.stringify({ value }),
        'PX',
        this.withJitter(ttlMs),
      );
    } catch {
      // Read cache is fail-open; callers already have the source value.
    }
  }

  private withJitter(ttlMs: number) {
    const jitter = Math.floor(ttlMs * 0.1 * Math.random());
    return ttlMs + jitter;
  }
}
