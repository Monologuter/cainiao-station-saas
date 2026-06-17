import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCode, BizError } from '../../../core/http/api-code';
import { CurrentUser, RequirePermission } from '../../identity/decorators';
import { SubscriptionService } from './subscription.service';

@Controller('billing/subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @RequirePermission('subscription:read')
  @Get()
  list(@CurrentUser() user: any, @Query() query: any) {
    return this.subscriptions.list({
      tenantId: user.isPlatform ? query.tenantId : user.tenantId,
      status: query.status,
    });
  }

  @RequirePermission('subscription:write')
  @Post()
  subscribe(@CurrentUser() user: any, @Body() body: any) {
    return this.subscriptions.subscribe({
      tenantId: user.isPlatform ? body.tenantId : user.tenantId,
      stationId: body.stationId,
      planId: body.planId,
    });
  }

  @RequirePermission('subscription:write')
  @Post(':id/renew')
  renew(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.subscriptions.renew(id, {
      tenantId: user.isPlatform ? undefined : user.tenantId,
      planId: body?.planId,
    });
  }

  @RequirePermission('subscription:write')
  @Post(':id/change-plan')
  changePlan(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.subscriptions.changePlan(
      id,
      body.planId,
      user.isPlatform ? undefined : user.tenantId,
    );
  }

  @RequirePermission('subscription:write')
  @Post(':id/cancel')
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.subscriptions.cancel(
      id,
      user.isPlatform ? undefined : user.tenantId,
    );
  }

  @RequirePermission('subscription:admin')
  @Post(':id/suspend')
  suspend(@CurrentUser() user: any, @Param('id') id: string) {
    this.assertPlatform(user);
    return this.subscriptions.suspend(id);
  }

  @RequirePermission('subscription:admin')
  @Post(':id/resume')
  resume(@CurrentUser() user: any, @Param('id') id: string) {
    this.assertPlatform(user);
    return this.subscriptions.resume(id);
  }

  private assertPlatform(user: any) {
    if (!user?.isPlatform) {
      throw new BizError(ApiCode.FORBIDDEN, '无权限执行该操作');
    }
  }
}
