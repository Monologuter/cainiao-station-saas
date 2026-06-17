import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { ChannelConfigService } from './channel-config.service';

export type ResolvedChannel = {
  channel: string;
  provider: string;
  enabled: boolean;
  fallbackProvider?: string | null;
};

@Injectable()
export class ChannelResolver {
  constructor(private readonly channels: ChannelConfigService) {}

  async resolve(channel: string): Promise<ResolvedChannel> {
    const config = await this.channels.get(channel);
    if (config.provider !== 'mock') {
      throw new BizError(
        ApiCode.NOT_IMPLEMENTED,
        `${channel} provider ${config.provider} 未接入，请回退 mock`,
      );
    }
    return {
      channel: config.channel,
      provider: config.provider,
      enabled: config.enabled,
      fallbackProvider: config.fallbackProvider,
    };
  }
}
