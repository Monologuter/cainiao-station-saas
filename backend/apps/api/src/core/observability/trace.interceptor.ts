import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';
import { TenantContext } from '../tenant-context/tenant-context';

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const res = ctx.switchToHttp().getResponse();
    const header = req.headers?.['x-request-id'];
    const traceId =
      typeof header === 'string' && header.trim().length > 0
        ? header
        : randomUUID();

    res.setHeader('X-Request-Id', traceId);
    const existing = TenantContext.get();

    return new Observable((subscriber) => {
      return TenantContext.run(
        {
          userId: existing?.userId ?? '',
          tenantId: existing?.tenantId ?? null,
          roles: existing?.roles ?? [],
          isPlatform: existing?.isPlatform ?? false,
          traceId,
        },
        () => {
          const subscription = next.handle().subscribe(subscriber);
          return () => subscription.unsubscribe();
        },
      );
    });
  }
}
