import { Body, Controller, Param, Post } from '@nestjs/common';
import { Public } from '../identity/decorators';
import { PayService } from './pay.service';

@Public()
@Controller('pay')
export class PayController {
  constructor(private readonly pay: PayService) {}

  @Post('wechat/callback/:tenantId/:outTradeNo')
  async confirmWechatPayCallback(
    @Param('tenantId') tenantId: string,
    @Param('outTradeNo') outTradeNo: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.pay.confirmShipOrderPaymentCallback(tenantId, outTradeNo, body);
    return { code: 'SUCCESS', message: 'OK' };
  }
}
