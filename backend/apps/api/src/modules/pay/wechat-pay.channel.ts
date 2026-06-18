import { createHmac } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { PayChannel, PayRequest, PayResult } from './pay-channel.interface';

export interface WechatPayClient {
  createTransaction(input: {
    appid: string;
    mchid: string;
    description: string;
    out_trade_no: string;
    notify_url: string;
    amount: { total: number; currency: 'CNY' };
  }): Promise<{ prepay_id?: string; code_url?: string }>;
}

interface WechatPayOptions {
  appId?: string;
  mchId?: string;
  apiV3Key?: string;
  notifyUrl?: string;
}

interface CallbackPayload {
  out_trade_no?: string;
  transaction_id?: string;
  amount?: { payer_total?: number };
  trade_state?: string;
  success_time?: string;
}

export const WECHAT_PAY_CLIENT = Symbol('WECHAT_PAY_CLIENT');
export const WECHAT_PAY_OPTIONS = Symbol('WECHAT_PAY_OPTIONS');

@Injectable()
export class WechatPayChannel implements PayChannel {
  readonly code = 'wechat';
  private readonly client: WechatPayClient;
  private readonly options: WechatPayOptions;

  constructor(
    @Optional()
    @Inject(WECHAT_PAY_CLIENT)
    client?: WechatPayClient,
    @Optional()
    @Inject(WECHAT_PAY_OPTIONS)
    options?: WechatPayOptions,
  ) {
    this.client = client ?? new MissingWechatPayClient();
    this.options = options ?? {
      appId: process.env.WXPAY_APP_ID,
      mchId: process.env.WXPAY_MCH_ID,
      apiV3Key: process.env.WXPAY_API_V3_KEY,
      notifyUrl: process.env.WXPAY_NOTIFY_URL,
    };
  }

  async pay(req: PayRequest): Promise<PayResult> {
    const response = await this.client.createTransaction({
      appid: this.options.appId ?? '',
      mchid: this.options.mchId ?? '',
      description: req.subject,
      out_trade_no: req.idempotencyKey,
      notify_url: this.options.notifyUrl ?? '',
      amount: { total: req.amount, currency: 'CNY' },
    });
    return {
      status: 'PENDING',
      outTradeNo: req.idempotencyKey,
      raw: {
        provider: this.code,
        prepayId: response.prepay_id,
        codeUrl: response.code_url,
      },
    };
  }

  verifyCallback(payload: unknown): PayResult {
    const input = payload as {
      payload: string;
      timestamp: string;
      nonce: string;
      signature: string;
      expectedAmount: number;
      now?: () => number;
    };
    if (!this.verifySignature(input)) {
      return {
        status: 'FAILED',
        outTradeNo: '',
        raw: { provider: this.code, callback: 'BAD_SIGNATURE' },
      };
    }

    const body = JSON.parse(input.payload) as CallbackPayload;
    if (
      body.trade_state !== 'SUCCESS' ||
      Number(body.amount?.payer_total ?? -1) !== input.expectedAmount
    ) {
      return {
        status: 'FAILED',
        outTradeNo: body.out_trade_no ?? '',
        raw: { provider: this.code, callback: 'AMOUNT_OR_STATE_MISMATCH' },
      };
    }

    return {
      status: 'SUCCESS',
      outTradeNo: body.out_trade_no ?? '',
      paidAt: body.success_time ? new Date(body.success_time) : new Date(),
      raw: {
        provider: this.code,
        transactionId: body.transaction_id,
      },
    };
  }

  signCallback(payload: string, timestamp: string, nonce: string) {
    return createHmac('sha256', this.options.apiV3Key ?? '')
      .update(`${timestamp}\n${nonce}\n${payload}`)
      .digest('hex');
  }

  private verifySignature(input: {
    payload: string;
    timestamp: string;
    nonce: string;
    signature: string;
    now?: () => number;
  }) {
    const timestampMs = Number(input.timestamp) * 1000;
    const now = input.now?.() ?? Date.now();
    if (
      !Number.isFinite(timestampMs) ||
      Math.abs(now - timestampMs) > 300_000
    ) {
      return false;
    }
    return (
      this.signCallback(input.payload, input.timestamp, input.nonce) ===
      input.signature
    );
  }
}

class MissingWechatPayClient implements WechatPayClient {
  async createTransaction() {
    return {};
  }
}
