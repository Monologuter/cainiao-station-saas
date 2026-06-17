import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { CurrentUser, RequirePermission } from '../identity/decorators';
import { AuditService } from './audit.service';

@Controller('admin/audit-logs')
@RequirePermission('audit:view')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  query(@CurrentUser() user: any, @Query() query: any) {
    this.requirePlatform(user);
    return this.audit.query({
      tenantId: query.tenantId,
      actorId: query.actorId,
      action: query.action,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      result: query.result,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: this.parsePositiveInt(query.page, 1),
      pageSize: this.parsePositiveInt(query.pageSize, 20, 100),
    });
  }

  @Get('actions')
  actions(@CurrentUser() user: any) {
    this.requirePlatform(user);
    return this.audit.listActions();
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    this.requirePlatform(user);
    return this.audit.findOne(id);
  }

  private requirePlatform(user: any) {
    if (!user?.isPlatform) {
      throw new BizError(ApiCode.FORBIDDEN, '仅平台用户可访问审计日志');
    }
  }

  private parsePositiveInt(
    value: string | undefined,
    fallback: number,
    max = 0,
  ) {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }
    return max > 0 ? Math.min(Math.floor(parsed), max) : Math.floor(parsed);
  }
}
