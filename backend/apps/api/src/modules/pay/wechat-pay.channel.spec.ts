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
