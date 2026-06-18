import { Injectable } from '@nestjs/common';
import { IntegrationConfigService } from '../config/integration-config.service';
import { MockPayChannel } from './mock-pay.channel';
import { PayChannel } from './pay-channel.interface';
import { WechatPayChannel } from './wechat-pay.channel';

@Injectable()
export class PayChannelFactory {
  constructor(
    private readonly integrations: IntegrationConfigService,
    private readonly mock: MockPayChannel,
    private readonly wechat: WechatPayChannel,
  ) {}

  async get(): Promise<PayChannel> {
    const resolved = await this.integrations.resolve('pay');
    if (resolved.provider === 'wechat' && !resolved.degraded) {
      return this.wechat;
    }
    return this.mock;
  }
}
