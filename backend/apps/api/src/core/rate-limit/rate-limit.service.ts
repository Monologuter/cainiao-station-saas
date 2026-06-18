import { Injectable } from '@nestjs/common';
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

  useClock(now: () => number) {
    this.now = now;
  }

  check(input: CheckInput): CheckResult {
    if (input.strategy === 'sliding-window') {
      return this.checkSlidingWindow(input);
    }
    return this.checkTokenBucket(input);
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
