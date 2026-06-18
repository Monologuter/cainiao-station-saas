import { Injectable } from '@nestjs/common';
import { IntegrationConfigService } from '../config/integration-config.service';
import { MockSmsChannel } from './mock-sms.channel';
import { NotifyChannel } from './notify-channel';
import { TencentSmsChannel } from './tencent-sms.channel';

@Injectable()
export class SmsChannelFactory {
  constructor(
    private readonly integrations: IntegrationConfigService,
    private readonly mock: MockSmsChannel,
    private readonly tencent: TencentSmsChannel,
  ) {}

  async get(): Promise<NotifyChannel> {
    const resolved = await this.integrations.resolve('sms');
    if (resolved.provider === 'tencent' && !resolved.degraded) {
      return this.tencent;
    }
    return this.mock;
  }
}
