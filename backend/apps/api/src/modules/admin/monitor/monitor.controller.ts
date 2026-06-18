import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiCode, BizError } from '../../../core/http/api-code';
import { CurrentUser, RequirePermission } from '../../identity/decorators';
import { MonitorService } from './monitor.service';

@Controller('admin/monitor')
@RequirePermission('monitor:view')
export class MonitorController {
  constructor(private readonly monitor: MonitorService) {}

  @Get('overview')
  overview(@CurrentUser() user: any) {
    this.requirePlatform(user);
    return this.monitor.overview();
  }

  @Get('stores')
  stores(@CurrentUser() user: any, @Query() query: any) {
    this.requirePlatform(user);
    return this.monitor.stores({
      page: this.parsePositiveInt(query.page, 1),
      pageSize: this.parsePositiveInt(query.pageSize, 20, 100),
    });
  }

  @Get('stores/:stationId')
  storeDetail(@CurrentUser() user: any, @Param('stationId') stationId: string) {
    this.requirePlatform(user);
    return this.monitor.storeDetail(stationId);
  }

  private requirePlatform(user: any) {
    if (!user?.isPlatform) {
      throw new BizError(ApiCode.FORBIDDEN, '仅平台用户可访问监控');
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
