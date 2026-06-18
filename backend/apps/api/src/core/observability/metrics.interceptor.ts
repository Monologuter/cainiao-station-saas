import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const started = process.hrtime.bigint();
    const http = ctx.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const record = (status: number) => {
      const elapsed = Number(process.hrtime.bigint() - started) / 1_000_000_000;
      this.metrics.recordHttpRequest({
        method: req.method ?? 'GET',
        route: req.route?.path ?? req.path ?? req.url ?? 'unknown',
        status,
        durationSeconds: elapsed,
      });
    };

    return next.handle().pipe(
      tap(() => record(res.statusCode ?? 200)),
      catchError((err) => {
        record(err?.status ?? res.statusCode ?? 500);
        return throwError(() => err);
      }),
    );
  }
}
