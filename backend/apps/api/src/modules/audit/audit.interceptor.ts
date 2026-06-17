import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AUDIT_METADATA, AuditOptions } from './audit.decorator';
import { AuditRecordInput, AuditService } from './audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const options = this.reflector.getAllAndOverride<AuditOptions>(
      AUDIT_METADATA,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!options) {
      return next.handle();
    }

    const request = ctx.switchToHttp().getRequest();

    return next.handle().pipe(
      tap((response) => {
        this.record({
          ...this.baseRecord(request, options),
          result: 'SUCCESS',
          summary: this.resolveSummary(options, { request, response }),
        });
      }),
      catchError((error) => {
        this.record({
          ...this.baseRecord(request, options),
          result: 'FAILURE',
          summary: this.resolveSummary(options, { request, error }),
          errorCode: String(error?.code ?? ''),
          errorMessage: error?.message ?? String(error),
        });
        return throwError(() => error);
      }),
    );
  }

  private baseRecord(
    request: any,
    options: AuditOptions,
  ): Omit<AuditRecordInput, 'result'> {
    const user = request.user;
    return {
      tenantId: user?.tenantId ?? null,
      actorId: user?.userId ?? null,
      actorType: user ? (user.isPlatform ? 'PLATFORM' : 'STAFF') : 'SYSTEM',
      action: options.action,
      resourceType: options.resourceType,
      ip: request.ip ?? request.socket?.remoteAddress ?? null,
      userAgent: headerValue(request.headers?.['user-agent']),
      requestId: headerValue(request.headers?.['x-request-id']),
    };
  }

  private resolveSummary(
    options: AuditOptions,
    payload: Parameters<
      NonNullable<Exclude<AuditOptions['summary'], string>>
    >[0],
  ) {
    if (typeof options.summary === 'function') {
      return options.summary(payload);
    }
    return options.summary ?? null;
  }

  private record(input: AuditRecordInput) {
    void this.audit.record(input).catch((error) => {
      this.logger.warn(`audit record failed: ${error?.message ?? error}`);
    });
  }
}

function headerValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}
