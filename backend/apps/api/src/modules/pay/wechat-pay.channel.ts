import {
  createDecipheriv,
  createPublicKey,
  timingSafeEqual,
  verify,
} from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  PayChannel,
  PayRequest,
  PayResult,
  ReconcileDifference,
  ReconcilePayment,
  ReconcileStatementRow,
  RefundRequest,
  RefundResult,
} from './pay-channel.interface';

export interface WechatPayClient {
  createTransaction(input: {
    appid: string;
    mchid: string;
    description: string;
    out_trade_no: string;
    notify_url: string;
    amount: { total: number; currency: 'CNY' };
  }): Promise<{ prepay_id?: string; code_url?: string }>;
  refund?(input: {
    out_trade_no: string;
    out_refund_no: string;
    reason: string;
    amount: { refund: number; total: number; currency: 'CNY' };
  }): Promise<{ refund_id?: string }>;
}

interface WechatPayOptions {
  appId?: string;
  mchId?: string;
  apiV3Key?: string;
  notifyUrl?: string;
  platformPublicKey?: string;
  platformCertificateSerialNo?: string;
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
      platformPublicKey: process.env.WXPAY_PLATFORM_PUBLIC_KEY,
      platformCertificateSerialNo: process.env.WXPAY_PLATFORM_CERT_SERIAL_NO,
    };
  }

  async pay(req: PayRequest): Promise<PayResult> {
    if (!Number.isInteger(req.amount) || req.amount <= 0) {
      throw new Error('支付金额必须大于 0');
    }
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
      body: string;
      timestamp: string;
      nonce: string;
      signature: string;
      serial?: string;
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

    let body: CallbackPayload;
    try {
      body = this.decryptCallbackBody(input.body) as CallbackPayload;
    } catch {
      return {
        status: 'FAILED',
        outTradeNo: '',
        raw: { provider: this.code, callback: 'BAD_RESOURCE' },
      };
    }
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

  async refund(req: RefundRequest): Promise<RefundResult> {
    if (req.refundAmount > req.amount) {
      throw new Error('退款金额不能超过原支付金额');
    }
    const response = await this.client.refund?.({
      out_trade_no: req.outTradeNo,
      out_refund_no: req.refundNo,
      reason: req.reason,
      amount: {
        refund: req.refundAmount,
        total: req.amount,
        currency: 'CNY',
      },
    });
    return {
      status: 'SUCCESS',
      refundNo: req.refundNo,
      raw: {
        provider: this.code,
        refundId: response?.refund_id,
      },
    };
  }

  reconcile(
    systemPayments: ReconcilePayment[],
    providerRows: ReconcileStatementRow[],
  ): ReconcileDifference[] {
    const differences: ReconcileDifference[] = [];
    const providerByTradeNo = new Map(
      providerRows.map((row) => [row.outTradeNo, row]),
    );
    const systemByTradeNo = new Map(
      systemPayments.map((payment) => [payment.outTradeNo, payment]),
    );

    for (const payment of systemPayments) {
      const provider = providerByTradeNo.get(payment.outTradeNo);
      if (!provider) {
        differences.push({
          outTradeNo: payment.outTradeNo,
          type: 'MISSING_IN_PROVIDER',
          system: payment,
        });
        continue;
      }
      if (provider.amount !== payment.amount) {
        differences.push({
          outTradeNo: payment.outTradeNo,
          type: 'AMOUNT_MISMATCH',
          system: payment,
          provider,
        });
        continue;
      }
      if (provider.status !== payment.status) {
        differences.push({
          outTradeNo: payment.outTradeNo,
          type: 'STATUS_MISMATCH',
          system: payment,
          provider,
        });
      }
    }

    for (const row of providerRows) {
      if (!systemByTradeNo.has(row.outTradeNo)) {
        differences.push({
          outTradeNo: row.outTradeNo,
          type: 'MISSING_IN_SYSTEM',
          provider: row,
        });
      }
    }
    return differences;
  }

  private verifySignature(input: {
    body: string;
    timestamp: string;
    nonce: string;
    signature: string;
    serial?: string;
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
    if (
      this.options.platformCertificateSerialNo &&
      input.serial &&
      !this.safeEqual(this.options.platformCertificateSerialNo, input.serial)
    ) {
      return false;
    }
    if (!this.options.platformPublicKey) {
      return false;
    }
    return verify(
      'RSA-SHA256',
      Buffer.from(`${input.timestamp}\n${input.nonce}\n${input.body}\n`),
      createPublicKey(this.options.platformPublicKey),
      Buffer.from(input.signature, 'base64'),
    );
  }

  private decryptCallbackBody(body: string) {
    const parsed = JSON.parse(body) as {
      resource?: {
        algorithm?: string;
        ciphertext?: string;
        nonce?: string;
        associated_data?: string;
      };
    };
    const resource = parsed.resource;
    if (resource?.algorithm !== 'AEAD_AES_256_GCM') {
      throw new Error('unsupported wechat pay resource algorithm');
    }
    if (!resource.ciphertext || !resource.nonce || !this.options.apiV3Key) {
      throw new Error('invalid wechat pay encrypted resource');
    }
    const ciphertext = Buffer.from(resource.ciphertext, 'base64');
    const authTag = ciphertext.subarray(ciphertext.length - 16);
    const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(this.options.apiV3Key),
      Buffer.from(resource.nonce),
    );
    if (resource.associated_data) {
      decipher.setAAD(Buffer.from(resource.associated_data));
    }
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext);
  }

  private safeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }
}

class MissingWechatPayClient implements WechatPayClient {
  async createTransaction() {
    return {};
  }
}
