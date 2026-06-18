import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  CircuitBreakerOpenError,
  CircuitBreakerService,
} from '../../core/circuit-breaker/circuit-breaker.service';
import { NotifyChannel, RenderedMessage } from './notify-channel';

export interface TencentSmsClient {
  SendSms(input: TencentSmsSendInput): Promise<TencentSmsSendResponse>;
}

interface TencentSmsSendInput {
  SmsSdkAppId: string;
  SignName: string;
  TemplateId: string;
  TemplateParamSet: string[];
  PhoneNumberSet: string[];
}

interface TencentSmsSendResponse {
  SendStatusSet?: Array<{
    Code?: string;
    Message?: string;
    SerialNo?: string;
    Fee?: number;
  }>;
}

interface TencentSmsOptions {
  sdkAppId?: string;
  signName?: string;
  templateMap?: Record<string, string>;
}

export const TENCENT_SMS_CLIENT = Symbol('TENCENT_SMS_CLIENT');
export const TENCENT_SMS_OPTIONS = Symbol('TENCENT_SMS_OPTIONS');

const RETRYABLE_ERROR_CODES = new Set([
  'RequestLimitExceeded',
  'InternalError',
  'InternalError.RequestTimeException',
  'FailedOperation.Timeout',
  'FailedOperation.ServiceTimeout',
]);

// SEC-14 熔断：真实出站短信调用连续失败达到阈值后快速失败，
// 冷却期内不再打外部网络，保护下游 / 降低雪崩风险。
const SMS_BREAKER_OPTIONS = {
  failureThreshold: 3,
  coolDownMs: 30_000,
  timeoutMs: 5000,
};
const SMS_BREAKER_NAME = 'notify.tencent-sms.send';

@Injectable()
export class TencentSmsChannel implements NotifyChannel {
  readonly channel = 'SMS' as const;

  constructor(
    @Optional()
    @Inject(TENCENT_SMS_CLIENT)
    client?: TencentSmsClient,
    @Optional()
    @Inject(TENCENT_SMS_OPTIONS)
    options?: TencentSmsOptions,
    @Optional()
    breaker?: CircuitBreakerService,
  ) {
    this.client = client ?? new MissingTencentSmsClient();
    this.options = options ?? {
      sdkAppId: process.env.TENCENT_SMS_SDK_APP_ID,
      signName: process.env.TENCENT_SMS_SIGN_NAME,
      templateMap: parseTemplateMap(process.env.TENCENT_SMS_TEMPLATE_MAP),
    };
    this.breaker = breaker;
  }

  private readonly client: TencentSmsClient;
  private readonly options: TencentSmsOptions;
  private readonly breaker?: CircuitBreakerService;

  async send(message: RenderedMessage) {
    const templateId = this.templateId(message.templateCode);
    if (!message.receiverPhone || !templateId) {
      return {
        ok: false,
        error: 'missing receiver or template',
        retryable: false,
      };
    }

    try {
      const response = await this.withBreaker(() =>
        this.client.SendSms({
          SmsSdkAppId: this.options.sdkAppId ?? '',
          SignName: this.options.signName ?? '',
          TemplateId: templateId,
          TemplateParamSet: message.variables ?? [],
          PhoneNumberSet: [this.formatPhone(message.receiverPhone)],
        }),
      );
      const status = response.SendStatusSet?.[0];
      if (status?.Code && status.Code !== 'Ok') {
        return {
          ok: false,
          error: status.Message ?? status.Code,
          retryable: this.isRetryable(status.Code),
          providerRequestId: status.SerialNo,
        };
      }
      return {
        ok: true,
        billingUnits: Number(status?.Fee ?? 1),
        providerRequestId: status?.SerialNo,
      };
    } catch (error: any) {
      // 熔断打开属于临时不可用：直接判定为可重试快速失败，交由队列稍后重投。
      if (error instanceof CircuitBreakerOpenError) {
        return {
          ok: false,
          error: 'sms circuit open',
          retryable: true,
        };
      }
      const code = String(error?.code ?? error?.Code ?? error?.name ?? '');
      return {
        ok: false,
        error: code || 'tencent sms failed',
        retryable: this.isRetryable(code),
      };
    }
  }

  private withBreaker(
    action: () => Promise<TencentSmsSendResponse>,
  ): Promise<TencentSmsSendResponse> {
    if (!this.breaker) {
      return action();
    }
    return this.breaker.execute(SMS_BREAKER_NAME, SMS_BREAKER_OPTIONS, action);
  }

  private templateId(templateCode?: string) {
    return templateCode ? this.options.templateMap?.[templateCode] : undefined;
  }

  private formatPhone(phone: string) {
    return phone.startsWith('+') ? phone : `+86${phone}`;
  }

  private isRetryable(code: string) {
    if (!code) {
      return true;
    }
    return (
      RETRYABLE_ERROR_CODES.has(code) ||
      code.includes('LimitExceeded') ||
      code.includes('Timeout') ||
      code.includes('InternalError')
    );
  }
}

class MissingTencentSmsClient implements TencentSmsClient {
  async SendSms(): Promise<TencentSmsSendResponse> {
    return {
      SendStatusSet: [
        {
          Code: 'FailedOperation.MissingClient',
          Message: 'Tencent SMS SDK client is not configured',
        },
      ],
    };
  }
}

function parseTemplateMap(value?: string): Record<string, string> {
  if (!value) {
    return {};
  }
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
