import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_META = 'rateLimit';

export type RateLimitStrategy = 'token-bucket' | 'sliding-window';
export type RateLimitKeyBy = 'ip' | 'user' | 'login';

export interface RateLimitOptions {
  keyPrefix: string;
  strategy: RateLimitStrategy;
  limit: number;
  windowMs: number;
  keyBy?: RateLimitKeyBy;
}

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_META, options);
