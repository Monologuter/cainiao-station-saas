import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiCode, BizError } from '../../../core/http/api-code';
import { Public, RequirePermission } from '../../identity/decorators';
import { SubscriptionPayService } from './subscription-pay.service';

@Controller()
export class SubscriptionPayController {
  constructor(private readonly pay: SubscriptionPayService) {}

  @RequirePermission('invoice:pay')
  @Post('billing/invoices/:id/pay')
  payInvoice(
    @Param('id') id: string,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey) {
      throw new BizError(ApiCode.BAD_REQUEST, '缺少支付幂等键');
    }
    return this.pay.payInvoice(id, idempotencyKey);
  }

  @Public()
  @Post('billing/pay/callback')
  callback(@Body() body: any) {
    return this.pay.handleCallback(body);
  }
}
