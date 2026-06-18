import { Injectable, Optional } from '@nestjs/common';
import { ChannelConfigService } from './channel-config.service';

export type IntegrationKind = 'sms' | 'wechat' | 'pay' | 'logistics';

export interface ResolvedIntegration {
  kind: IntegrationKind;
  channel: string;
  provider: string;
  fallbackProvider: string;
  enabled: boolean;
  source: 'db' | 'env' | 'default';
  degraded: boolean;
  degradeReason?: string;
}

const CHANNEL_BY_KIND: Record<IntegrationKind, string> = {
  sms: 'sms',
  wechat: 'wechat',
  pay: 'pay',
  logistics: 'logistics',
};

const ENV_BY_KIND: Record<IntegrationKind, string> = {
  sms: 'NOTIFY_SMS_PROVIDER',
  wechat: 'NOTIFY_WECHAT_PROVIDER',
  pay: 'PAY_PROVIDER',
  logistics: 'LOGISTICS_PROVIDER',
};

const REQUIRED_ENV: Partial<Record<IntegrationKind, Record<string, string[]>>> =
  {
    sms: {
      tencent: [
        'TENCENT_SMS_SECRET_ID',
        'TENCENT_SMS_SECRET_KEY',
        'TENCENT_SMS_SDK_APP_ID',
        'TENCENT_SMS_SIGN_NAME',
      ],
    },
    wechat: {
      wechat: ['WECHAT_APP_ID', 'WECHAT_APP_SECRET'],
    },
    pay: {
      wechat: [
        'WXPAY_MCH_ID',
        'WXPAY_APP_ID',
        'WXPAY_API_V3_KEY',
        'WXPAY_PRIVATE_KEY',
        'WXPAY_CERT_SERIAL_NO',
      ],
    },
    logistics: {
      kuaidi100: ['KUAIDI100_KEY', 'KUAIDI100_CUSTOMER'],
      kdniao: ['KDNIAO_EBUSINESS_ID', 'KDNIAO_API_KEY'],
    },
  };

@Injectable()
export class IntegrationConfigService {
  constructor(@Optional() private readonly channels?: ChannelConfigService) {}

  async resolve(kind: IntegrationKind): Promise<ResolvedIntegration> {
    const channel = CHANNEL_BY_KIND[kind];
    const fallbackProvider = 'mock';
    let provider = process.env[ENV_BY_KIND[kind]] ?? fallbackProvider;
    let enabled = true;
    let source: ResolvedIntegration['source'] =
      process.env[ENV_BY_KIND[kind]] === undefined ? 'default' : 'env';

    try {
      const config = await this.channels?.get(channel);
      if (config) {
        provider = config.enabled
          ? config.provider
          : (config.fallbackProvider ?? fallbackProvider);
        enabled = config.enabled;
        source = 'db';
      }
    } catch {
      // DB channel config is optional for bootstrapping; env/default remains.
    }

    const missing = this.missingRequiredEnv(kind, provider);
    if (provider !== fallbackProvider && missing.length > 0) {
      return {
        kind,
        channel,
        provider: fallbackProvider,
        fallbackProvider,
        enabled,
        source,
        degraded: true,
        degradeReason: `missing ${missing.join(',')}`,
      };
    }

    return {
      kind,
      channel,
      provider,
      fallbackProvider,
      enabled,
      source,
      degraded: false,
    };
  }

  mask(value: string | undefined | null) {
    if (!value) {
      return '';
    }
    if (value.length <= 8) {
      return `${value.slice(0, 1)}***${value.slice(-1)}`;
    }
    return `${value.slice(0, 4)}***${value.slice(-4)}`;
  }

  private missingRequiredEnv(kind: IntegrationKind, provider: string) {
    const keys = REQUIRED_ENV[kind]?.[provider] ?? [];
    return keys.filter((key) => !process.env[key]);
  }
}
