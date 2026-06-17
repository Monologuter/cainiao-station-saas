import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiCode, BizError } from '../../core/http/api-code';
import { PERMS } from './decorators';

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
    if (user?.isPlatform || required.every((perm) => owned.includes(perm))) {
      return true;
    }

    throw new BizError(ApiCode.FORBIDDEN, '无权限执行该操作');
  }
}
