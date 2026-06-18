import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiCode, BizError } from '../http/api-code';
import {
  RATE_LIMIT_META,
  RateLimitKeyBy,
  RateLimitOptions,
} from './rate-limit.decorator';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limits: RateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_META,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const key = `${options.keyPrefix}:${this.subject(req, options.keyBy ?? 'user')}`;
    const result = this.limits.check({ ...options, key });
    if (result.allowed) return true;

    res.setHeader('Retry-After', String(result.retryAfter ?? 1));
    throw new BizError(ApiCode.RATE_LIMITED, '请求过于频繁，请稍后再试');
  }

  private subject(req: any, keyBy: RateLimitKeyBy): string {
    const ip = this.clientIp(req);
    if (keyBy === 'ip') return ip;
    if (keyBy === 'login') {
      return `${ip}:${String(req.body?.username ?? 'anonymous')}`;
    }
    return req.user?.userId ?? ip;
  }

  private clientIp(req: any): string {
    const forwarded = req.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }
    return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  }
}
