import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiCode, BizError } from '../../core/http/api-code';
import { PERMS } from './decorators';

const SUSPENDED_TENANT_ALLOWED_PERMS = new Set([
  'invoice:read',
  'invoice:pay',
  'subscription:read',
  'usage:read',
  'plan:read',
]);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user;
    const owned: string[] = user?.perms ?? [];
    if (
      !user?.isPlatform &&
      user?.tenantStatus === 'SUSPENDED' &&
      required.some((perm) => !SUSPENDED_TENANT_ALLOWED_PERMS.has(perm))
    ) {
      throw new BizError(ApiCode.FORBIDDEN, '租户已欠费停用');
    }

    if (user?.isPlatform || required.every((perm) => owned.includes(perm))) {
      return true;
    }

    throw new BizError(ApiCode.FORBIDDEN, '无权限执行该操作');
  }
}
