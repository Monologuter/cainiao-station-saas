import { Body, Controller, Param, Post } from '@nestjs/common';
import { Public } from '../identity/decorators';
import { LogisticsService } from './logistics.service';

@Public()
@Controller('logistics')
export class LogisticsController {
  constructor(private readonly logistics: LogisticsService) {}

  @Post('kuaidi100/callback/:tenantId/:waybillNo')
  async handleKuaiDi100Callback(
    @Param('tenantId') tenantId: string,
    @Param('waybillNo') waybillNo: string,
    @Body() body: { payload: string; sign: string },
  ) {
    await this.logistics.handleProviderCallback(tenantId, waybillNo, body);
    return { result: true };
  }
}
