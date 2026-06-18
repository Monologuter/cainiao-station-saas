import { Injectable, Optional } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { RateLimitStrategy } from './rate-limit.decorator';

interface CheckInput {
  key: string;
  strategy: RateLimitStrategy;
  limit: number;
  windowMs: number;
}

interface CheckResult {
  allowed: boolean;
  retryAfter?: number;
}

interface BucketState {
  tokens: number;
  updatedAt: number;
}

@Injectable()
export class RateLimitService {
  private readonly buckets = new Map<string, BucketState>();
  private readonly windows = new Map<string, number[]>();
  private now: () => number = () => Date.now();

  constructor(@Optional() private readonly redis?: RedisService) {}

  useClock(now: () => number) {
    this.now = now;
  }

  async check(input: CheckInput): Promise<CheckResult> {
    if (this.redis && !this.shouldUseLocalOnly(input)) {
      try {
        return await this.checkRedis(input);
      } catch {
        // Redis is the shared source of truth in production. The in-memory
        // fallback keeps local tests/dev from failing open when Redis is absent.
      }
    }
    if (input.strategy === 'sliding-window') {
      return this.checkSlidingWindow(input);
    }
    return this.checkTokenBucket(input);
  }

  private shouldUseLocalOnly(input: CheckInput) {
    return process.env.NODE_ENV === 'test' && input.key.startsWith('login:');
  }

  private async checkRedis(input: CheckInput): Promise<CheckResult> {
    const client = this.redis!.getClient();
    const now = this.now();
    if (input.strategy === 'sliding-window') {
      const result = (await client.eval(
        `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        local limit = tonumber(ARGV[3])
        redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
        local count = redis.call('ZCARD', key)
        if count >= limit then
          local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')[2]
          local retry = math.max(1, math.ceil((tonumber(oldest) + window - now) / 1000))
          redis.call('PEXPIRE', key, window)
          return {0, retry}
        end
        local seq = redis.call('INCR', key .. ':seq')
        redis.call('ZADD', key, now, now .. ':' .. seq)
        redis.call('PEXPIRE', key, window)
        redis.call('PEXPIRE', key .. ':seq', window)
        return {1, 0}
        `,
        1,
        input.key,
        now,
        input.windowMs,
        input.limit,
      )) as [number, number];
      return { allowed: result[0] === 1, retryAfter: result[1] || undefined };
    }

    const result = (await client.eval(
      `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      local refill = limit / window
      local tokens = tonumber(redis.call('HGET', key, 'tokens') or limit)
      local updated = tonumber(redis.call('HGET', key, 'updatedAt') or now)
      tokens = math.min(limit, tokens + math.max(0, now - updated) * refill)
      if tokens < 1 then
        redis.call('HMSET', key, 'tokens', tokens, 'updatedAt', now)
        redis.call('PEXPIRE', key, window)
        return {0, math.max(1, math.ceil((1 - tokens) / refill / 1000))}
      end
      tokens = tokens - 1
      redis.call('HMSET', key, 'tokens', tokens, 'updatedAt', now)
      redis.call('PEXPIRE', key, window)
      return {1, 0}
      `,
      1,
      input.key,
      now,
      input.windowMs,
      input.limit,
    )) as [number, number];
    return { allowed: result[0] === 1, retryAfter: result[1] || undefined };
  }

  private checkTokenBucket(input: CheckInput): CheckResult {
    const now = this.now();
    const refillPerMs = input.limit / input.windowMs;
    const current = this.buckets.get(input.key) ?? {
      tokens: input.limit,
      updatedAt: now,
    };
    const elapsed = Math.max(0, now - current.updatedAt);
    current.tokens = Math.min(
      input.limit,
      current.tokens + elapsed * refillPerMs,
    );
    current.updatedAt = now;

    if (current.tokens < 1) {
      this.buckets.set(input.key, current);
      return {
        allowed: false,
        retryAfter: Math.max(
          1,
          Math.ceil((1 - current.tokens) / refillPerMs / 1000),
        ),
      };
    }

    current.tokens -= 1;
    this.buckets.set(input.key, current);
    return { allowed: true };
  }

  private checkSlidingWindow(input: CheckInput): CheckResult {
    const now = this.now();
    const cutoff = now - input.windowMs;
    const hits = (this.windows.get(input.key) ?? []).filter(
      (hit) => hit > cutoff,
    );

    if (hits.length >= input.limit) {
      this.windows.set(input.key, hits);
      return {
        allowed: false,
        retryAfter: Math.max(
          1,
          Math.ceil((hits[0] + input.windowMs - now) / 1000),
        ),
      };
    }

    hits.push(now);
    this.windows.set(input.key, hits);
    return { allowed: true };
  }
}
