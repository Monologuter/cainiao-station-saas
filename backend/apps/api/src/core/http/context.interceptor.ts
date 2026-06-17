import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContext } from '../tenant-context/tenant-context';

@Injectable()
export class ContextInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return next.handle();

    return new Observable((subscriber) => {
      return TenantContext.run(
        {
          userId: user.userId,
          tenantId: user.tenantId ?? null,
          roles: user.roles ?? [],
          isPlatform: !!user.isPlatform,
        },
        () => {
          const subscription = next.handle().subscribe(subscriber);
          return () => subscription.unsubscribe();
        },
      );
    });
  }
}
