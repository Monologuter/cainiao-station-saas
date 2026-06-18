import { Body, Controller, Param, Post } from '@nestjs/common';
import { Public } from '../identity/decorators';
import { WechatPayCallbackDto } from './pay.dto';
import { PayService } from './pay.service';

@Public()
@Controller('pay')
export class PayController {
  constructor(private readonly pay: PayService) {}

  @Post('wechat/callback/:tenantId/:outTradeNo')
  async confirmWechatPayCallback(
    @Param('tenantId') tenantId: string,
    @Param('outTradeNo') outTradeNo: string,
    @Body() body: WechatPayCallbackDto,
  ) {
    await this.pay.confirmShipOrderPaymentCallback(
      tenantId,
      outTradeNo,
      body as unknown as Record<string, unknown>,
    );
    return { code: 'SUCCESS', message: 'OK' };
  }
}
