import { Inject, Injectable, Optional } from '@nestjs/common';
import { NotifyChannel, RenderedMessage } from './notify-channel';
import { WechatSubscribeAuthService } from './wechat-subscribe-auth.service';

export interface WechatSubscribeClient {
  sendSubscribeMessage(input: {
    touser: string;
    template_id: string;
    page?: string;
    data: Record<string, { value: string }>;
  }): Promise<{ errcode?: number; errmsg?: string; msgid?: string }>;
}

interface WechatSubscribeOptions {
  templateMap?: Record<string, string>;
  pageMap?: Record<string, string>;
}

export const WECHAT_SUBSCRIBE_CLIENT = Symbol('WECHAT_SUBSCRIBE_CLIENT');
export const WECHAT_SUBSCRIBE_OPTIONS = Symbol('WECHAT_SUBSCRIBE_OPTIONS');

@Injectable()
export class WechatSubscribeChannel implements NotifyChannel {
  readonly channel = 'WECHAT' as const;
  private readonly client: WechatSubscribeClient;
  private readonly options: WechatSubscribeOptions;

  constructor(
    @Optional()
    @Inject(WECHAT_SUBSCRIBE_CLIENT)
    client?: WechatSubscribeClient,
    private readonly auth?: WechatSubscribeAuthService,
    @Optional()
    @Inject(WECHAT_SUBSCRIBE_OPTIONS)
    options?: WechatSubscribeOptions,
  ) {
    this.client = client ?? new MissingWechatSubscribeClient();
    this.options = options ?? {
      templateMap: parseMap(process.env.WECHAT_SUBSCRIBE_TEMPLATE_MAP),
      pageMap: parseMap(process.env.WECHAT_SUBSCRIBE_PAGE_MAP),
    };
  }

  async send(message: RenderedMessage) {
    const templateId = this.templateId(message.templateCode);
    if (!templateId || !message.tenantId || !message.consumerId || !this.auth) {
      return {
        ok: false,
        error: 'NO_AUTHORIZATION',
        retryable: false,
      };
    }

    const consumed = await this.auth.consume({
      tenantId: message.tenantId,
      consumerId: message.consumerId,
      templateId,
    });
    if (!consumed.ok) {
      return { ok: false, error: 'NO_AUTHORIZATION', retryable: false };
    }

    const response = await this.client.sendSubscribeMessage({
      touser: consumed.openid,
      template_id: templateId,
      page: this.page(message.templateCode),
      data: this.toTemplateData(message.variables ?? []),
    });
    if (response.errcode && response.errcode !== 0) {
      return {
        ok: false,
        error: response.errmsg ?? String(response.errcode),
        retryable: this.isRetryable(response.errcode),
      };
    }
    return { ok: true, providerRequestId: response.msgid };
  }

  private templateId(templateCode?: string) {
    return templateCode ? this.options.templateMap?.[templateCode] : undefined;
  }

  private page(templateCode?: string) {
    return templateCode ? this.options.pageMap?.[templateCode] : undefined;
  }

  private toTemplateData(values: string[]) {
    return Object.fromEntries(
      values.map((value, index) => [`thing${index + 1}`, { value }]),
    );
  }

  private isRetryable(errcode: number) {
    return errcode === -1 || errcode === 45009 || errcode === 40001;
  }
}

class MissingWechatSubscribeClient implements WechatSubscribeClient {
  async sendSubscribeMessage() {
    return {
      errcode: 500,
      errmsg: 'Wechat subscribe client is not configured',
    };
  }
}

function parseMap(value?: string): Record<string, string> {
  if (!value) {
    return {};
  }
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
