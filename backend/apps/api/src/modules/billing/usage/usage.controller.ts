import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser, RequirePermission } from '../../identity/decorators';
import { UsageService } from './usage.service';

@Controller('billing/usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @RequirePermission('usage:read')
  @Get()
  list(@CurrentUser() user: any, @Query() query: any) {
    return this.usage.list({
      tenantId: user.isPlatform ? query.tenantId : user.tenantId,
      subscriptionId: query.subscriptionId,
      metric: query.metric,
    });
  }

  @RequirePermission('usage:meter')
  @Post('meter')
  meter(@CurrentUser() user: any, @Body() body: any) {
    return this.usage.meter({
      tenantId: user.isPlatform ? body.tenantId : user.tenantId,
      stationId: body.stationId,
      eventId: body.eventId,
      metric: body.metric,
      quantity: body.quantity,
      eventAt: body.eventAt ? new Date(body.eventAt) : undefined,
    });
  }
}
