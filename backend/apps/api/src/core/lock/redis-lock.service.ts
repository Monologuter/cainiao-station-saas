import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiCode, BizError } from '../http/api-code';
import { RedisService } from '../redis/redis.service';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const EXTEND_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

export interface RedisLockHandle {
  ok: boolean;
  key?: string;
  token?: string;
  release: () => Promise<boolean>;
  extend?: (ttlMs: number) => Promise<boolean>;
}

@Injectable()
export class RedisLockService {
  constructor(private readonly redis: RedisService) {}

  static key(...parts: string[]): string {
    return ['lock', ...parts.map((part) => part.trim()).filter(Boolean)].join(
      ':',
    );
  }

  async acquire(key: string, ttlMs: number): Promise<RedisLockHandle> {
    const token = randomUUID();
    const client = this.redis.getClient();

    try {
      const result = await client.set(key, token, 'PX', ttlMs, 'NX');
      if (result !== 'OK') return this.missedHandle(key);

      return {
        ok: true,
        key,
        token,
        release: async () =>
          (await client.eval(RELEASE_SCRIPT, 1, key, token)) === 1,
        extend: async (nextTtlMs: number) =>
          (await client.eval(EXTEND_SCRIPT, 1, key, token, nextTtlMs)) === 1,
      };
    } catch {
      throw new BizError(ApiCode.LOCK_BUSY, '锁服务不可用，请稍后重试');
    }
  }

  async runWithLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const lock = await this.acquire(key, ttlMs);
    if (!lock.ok) {
      throw new BizError(ApiCode.LOCK_BUSY, '操作繁忙，请稍后重试');
    }

    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }

  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.runWithLock(key, ttlMs, fn);
  }

  private missedHandle(key: string): RedisLockHandle {
    return {
      ok: false,
      key,
      release: async () => false,
      extend: async () => false,
    };
  }
}
