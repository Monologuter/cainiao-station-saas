import { Injectable } from '@nestjs/common';

const CHANNEL_PROVIDERS: Record<string, string[]> = {
  sms: ['mock', 'tencent'],
  pay: ['mock', 'wechat'],
  logistics: ['mock', 'kuaidi100'],
  ocr: ['mock', 'provider'],
  storage: ['mock', 'minio'],
};

@Injectable()
export class ProviderRegistry {
  providersFor(channel: string) {
    return [...(CHANNEL_PROVIDERS[channel] ?? ['mock'])];
  }

  isRegistered(channel: string, provider: string) {
    return this.providersFor(channel).includes(provider);
  }
}
