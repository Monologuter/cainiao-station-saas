import {
  createCipheriv,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto';
import { IntegrationConfigService } from '../config/integration-config.service';
import { MockPayChannel } from './mock-pay.channel';
import { PayChannelFactory } from './pay-channel.factory';
import { WechatPayChannel } from './wechat-pay.channel';

describe('WechatPayChannel', () => {
  it('creates a JSAPI payment with system amount and idempotent out_trade_no', async () => {
    const client = {
      createTransaction: jest.fn().mockResolvedValue({
        prepay_id: 'prepay-1',
        code_url: undefined,
      }),
    };
    const channel = new WechatPayChannel(client as any, {
      appId: 'wx-app',
      mchId: 'mch-1',
      apiV3Key: 'secret',
      notifyUrl: 'https://example.com/pay/callback',
    });

    await expect(
      channel.pay({
        bizType: 'SHIP_ORDER',
        bizId: 'so1',
        amount: 1300,
        idempotencyKey: 'pay-key-1',
        subject: '寄件订单 SO1',
      }),
    ).resolves.toMatchObject({
      status: 'PENDING',
      outTradeNo: 'pay-key-1',
      raw: expect.objectContaining({
        provider: 'wechat',
        prepayId: 'prepay-1',
      }),
    });
    expect(client.createTransaction).toHaveBeenCalledWith({
      appid: 'wx-app',
      mchid: 'mch-1',
      description: '寄件订单 SO1',
      out_trade_no: 'pay-key-1',
      notify_url: 'https://example.com/pay/callback',
      amount: { total: 1300, currency: 'CNY' },
    });
  });

  it('verifies and decrypts a WeChat Pay v3 callback and rejects forged signatures', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
    });
    const apiV3Key = '0123456789abcdef0123456789abcdef';
    const channel = new WechatPayChannel(
      { createTransaction: jest.fn() } as any,
      {
        appId: 'wx-app',
        mchId: 'mch-1',
        apiV3Key,
        notifyUrl: 'https://example.com/pay/callback',
        platformPublicKey: publicKey.export({ type: 'spki', format: 'pem' }) as string,
        platformCertificateSerialNo: 'serial-1',
      },
    );
    const decrypted = JSON.stringify({
      out_trade_no: 'pay-key-1',
      transaction_id: 'wx-tx-1',
      amount: { payer_total: 1300 },
      trade_state: 'SUCCESS',
      success_time: '2026-06-18T10:00:00.000Z',
    });
    const resource = encryptResource(apiV3Key, decrypted);
    const body = JSON.stringify({ resource });
    const timestamp = '100';
    const nonce = 'nonce-1';
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(`${timestamp}\n${nonce}\n${body}\n`),
      privateKey,
    ).toString('base64');

    expect(
      channel.verifyCallback({
        body,
        timestamp,
        nonce,
        signature,
        serial: 'serial-1',
        expectedAmount: 1300,
        now: () => 100_000,
      }),
    ).toMatchObject({
      status: 'SUCCESS',
      outTradeNo: 'pay-key-1',
      raw: expect.objectContaining({ transactionId: 'wx-tx-1' }),
    });
    expect(
      channel.verifyCallback({
        body,
        timestamp,
        nonce: 'nonce-2',
        signature: 'bad',
        serial: 'serial-1',
        expectedAmount: 1300,
        now: () => 100_000,
      }),
    ).toMatchObject({ status: 'FAILED' });
  });

  it('refunds through WeChat Pay without exceeding the original amount', async () => {
    const client = {
      createTransaction: jest.fn(),
      refund: jest.fn().mockResolvedValue({ refund_id: 'wx-refund-1' }),
    };
    const channel = new WechatPayChannel(client as any, {
      appId: 'wx-app',
      mchId: 'mch-1',
      apiV3Key: 'secret',
    });

    await expect(
      channel.refund({
        outTradeNo: 'pay-key-1',
        refundNo: 'refund-1',
        amount: 1300,
        refundAmount: 500,
        reason: '用户取消',
      }),
    ).resolves.toMatchObject({
      status: 'SUCCESS',
      refundNo: 'refund-1',
      raw: expect.objectContaining({ refundId: 'wx-refund-1' }),
    });
    expect(client.refund).toHaveBeenCalledWith({
      out_trade_no: 'pay-key-1',
      out_refund_no: 'refund-1',
      reason: '用户取消',
      amount: {
        refund: 500,
        total: 1300,
        currency: 'CNY',
      },
    });

    await expect(
      channel.refund({
        outTradeNo: 'pay-key-1',
        refundNo: 'refund-2',
        amount: 1300,
        refundAmount: 1301,
        reason: '超额退款',
      }),
    ).rejects.toThrow('退款金额不能超过原支付金额');
  });

  it('finds statement reconciliation differences', () => {
    const channel = new WechatPayChannel({
      createTransaction: jest.fn(),
    } as any);

    expect(
      channel.reconcile(
        [
          { outTradeNo: 'pay-1', amount: 1300, status: 'SUCCESS' },
          { outTradeNo: 'pay-2', amount: 900, status: 'SUCCESS' },
          { outTradeNo: 'pay-3', amount: 500, status: 'SUCCESS' },
        ],
        [
          { outTradeNo: 'pay-1', amount: 1300, status: 'SUCCESS' },
          { outTradeNo: 'pay-2', amount: 800, status: 'SUCCESS' },
          { outTradeNo: 'pay-3', amount: 500, status: 'REFUNDED' },
          { outTradeNo: 'pay-4', amount: 100, status: 'SUCCESS' },
        ],
      ),
    ).toEqual([
      expect.objectContaining({ outTradeNo: 'pay-2', type: 'AMOUNT_MISMATCH' }),
      expect.objectContaining({ outTradeNo: 'pay-3', type: 'STATUS_MISMATCH' }),
      expect.objectContaining({
        outTradeNo: 'pay-4',
        type: 'MISSING_IN_SYSTEM',
      }),
    ]);
  });
});

function encryptResource(apiV3Key: string, plaintext: string) {
  const nonce = randomBytes(12).toString('base64url').slice(0, 12);
  const associatedData = 'transaction';
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(apiV3Key),
    Buffer.from(nonce),
  );
  cipher.setAAD(Buffer.from(associatedData));
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    algorithm: 'AEAD_AES_256_GCM',
    nonce,
    associated_data: associatedData,
    ciphertext: Buffer.concat([encrypted, tag]).toString('base64'),
  };
}

describe('PayChannelFactory', () => {
  it('selects WeChat pay only when switchboard resolves it without degradation', async () => {
    const integrations = {
      resolve: jest
        .fn()
        .mockResolvedValue({ provider: 'wechat', degraded: false }),
    } as unknown as jest.Mocked<IntegrationConfigService>;
    const mock = new MockPayChannel();
    const wechat = { code: 'wechat' } as any;

    await expect(
      new PayChannelFactory(integrations, mock, wechat).get(),
    ).resolves.toBe(wechat);
  });
});
