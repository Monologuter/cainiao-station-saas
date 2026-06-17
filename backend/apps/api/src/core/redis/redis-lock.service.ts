import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiCode, BizError } from '../http/api-code';
import { RedisService } from './redis.service';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

@Injectable()
export class RedisLockService {
  constructor(private readonly redis: RedisService) {}

  async acquire(
    key: string,
    ttlMs: number,
  ): Promise<{ ok: boolean; release: () => Promise<void> }> {
    const token = randomUUID();
    const client = this.redis.getClient();
    const result = await client.set(key, token, 'PX', ttlMs, 'NX');

    return {
      ok: result === 'OK',
      release: async () => {
        if (result !== 'OK') return;
        await client.eval(RELEASE_SCRIPT, 1, key, token);
      },
    };
  }

  async withLock<T>(
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
}
