import { Injectable } from '@nestjs/common';
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
    return {
      channel: config.channel,
      provider: config.provider,
      enabled: config.enabled,
      fallbackProvider: config.fallbackProvider,
    };
  }
}
