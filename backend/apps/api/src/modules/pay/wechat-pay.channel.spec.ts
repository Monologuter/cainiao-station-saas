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

  it('verifies signed callback and rejects forged signatures', () => {
    const channel = new WechatPayChannel(
      { createTransaction: jest.fn() } as any,
      {
        appId: 'wx-app',
        mchId: 'mch-1',
        apiV3Key: 'secret',
        notifyUrl: 'https://example.com/pay/callback',
      },
    );
    const payload = JSON.stringify({
      out_trade_no: 'pay-key-1',
      transaction_id: 'wx-tx-1',
      amount: { payer_total: 1300 },
      trade_state: 'SUCCESS',
      success_time: '2026-06-18T10:00:00.000Z',
    });

    expect(
      channel.verifyCallback({
        payload,
        timestamp: '100',
        nonce: 'nonce-1',
        signature: channel.signCallback(payload, '100', 'nonce-1'),
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
        payload,
        timestamp: '100',
        nonce: 'nonce-2',
        signature: 'bad',
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
