import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiCode, BizError } from '../../../core/http/api-code';
import { CurrentUser, RequirePermission } from '../../identity/decorators';
import { InvoiceService } from './invoice.service';

@Controller('billing/invoices')
export class InvoiceController {
  constructor(private readonly invoices: InvoiceService) {}

  @RequirePermission('invoice:read')
  @Get()
  list(@CurrentUser() user: any, @Query() query: any) {
    return this.invoices.list({
      tenantId: user.isPlatform ? query.tenantId : user.tenantId,
      status: query.status,
    });
  }

  @RequirePermission('invoice:read')
  @Get(':id')
  detail(@CurrentUser() user: any, @Param('id') id: string) {
    return this.invoices.detail(
      id,
      user.isPlatform ? undefined : user.tenantId,
    );
  }

  @RequirePermission('invoice:run')
  @Post('run')
  run(@CurrentUser() user: any, @Body() body: any) {
    return this.invoices.generateInvoice({
      tenantId: user.isPlatform ? body.tenantId : user.tenantId,
      subscriptionId: body.subscriptionId,
      periodStart: body.periodStart ? new Date(body.periodStart) : undefined,
    });
  }

  @RequirePermission('invoice:admin')
  @Post(':id/void')
  void(@CurrentUser() user: any, @Param('id') id: string) {
    if (!user?.isPlatform) {
      throw new BizError(ApiCode.FORBIDDEN, '无权限执行该操作');
    }
    return this.invoices.voidInvoice(id);
  }
}
