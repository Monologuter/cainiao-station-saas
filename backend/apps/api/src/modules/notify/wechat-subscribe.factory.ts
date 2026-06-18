import { Injectable } from '@nestjs/common';
import { IntegrationConfigService } from '../config/integration-config.service';
import { InAppChannel } from './in-app.channel';
import { NotifyChannel } from './notify-channel';
import { WechatSubscribeChannel } from './wechat-subscribe.channel';

@Injectable()
export class WechatSubscribeChannelFactory {
  constructor(
    private readonly integrations: IntegrationConfigService,
    private readonly fallback: InAppChannel,
    private readonly wechat: WechatSubscribeChannel,
  ) {}

  async get(): Promise<NotifyChannel> {
    const resolved = await this.integrations.resolve('wechat');
    if (resolved.provider === 'wechat' && !resolved.degraded) {
      return this.wechat;
    }
    return this.fallback;
  }
}
