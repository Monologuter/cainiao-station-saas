import { CircuitBreakerService } from '../../core/circuit-breaker/circuit-breaker.service';
import { IntegrationConfigService } from '../config/integration-config.service';
import { MockSmsChannel } from './mock-sms.channel';
import { SmsChannelFactory } from './sms-channel.factory';
import { TencentSmsChannel } from './tencent-sms.channel';

describe('TencentSmsChannel', () => {
  it('maps business template and variables to Tencent send request and billing units', async () => {
    const client = {
      SendSms: jest.fn().mockResolvedValue({
        SendStatusSet: [{ Code: 'Ok', SerialNo: 'serial-1', Fee: 2 }],
      }),
    };
    const channel = new TencentSmsChannel(client as any, {
      sdkAppId: 'appid',
      signName: '菜鸟驿站',
      templateMap: { PARCEL_STORED: 'tpl-1001' },
    });

    await expect(
      channel.send({
        channel: 'SMS',
        content: '取件码1234，库位A-01',
        receiverPhone: '13800000000',
        templateCode: 'PARCEL_STORED',
        variables: ['1234', 'A-01'],
      }),
    ).resolves.toEqual({
      ok: true,
      billingUnits: 2,
      providerRequestId: 'serial-1',
    });
    expect(client.SendSms).toHaveBeenCalledWith({
      SmsSdkAppId: 'appid',
      SignName: '菜鸟驿站',
      TemplateId: 'tpl-1001',
      TemplateParamSet: ['1234', 'A-01'],
      PhoneNumberSet: ['+8613800000000'],
    });
  });

  it('classifies retryable and non-retryable Tencent errors', async () => {
    const client = {
      SendSms: jest
        .fn()
        .mockRejectedValueOnce({ code: 'RequestLimitExceeded' })
        .mockRejectedValueOnce({ code: 'FailedOperation.TemplateIncorrect' }),
    };
    const channel = new TencentSmsChannel(client as any, {
      sdkAppId: 'appid',
      signName: '菜鸟驿站',
      templateMap: { PARCEL_STORED: 'tpl-1001' },
    });

    await expect(
      channel.send({
        channel: 'SMS',
        content: 'ok',
        receiverPhone: '13800000000',
        templateCode: 'PARCEL_STORED',
        variables: ['1234'],
      }),
    ).resolves.toMatchObject({ ok: false, retryable: true });
    await expect(
      channel.send({
        channel: 'SMS',
        content: 'ok',
        receiverPhone: '13800000000',
        templateCode: 'PARCEL_STORED',
        variables: ['1234'],
      }),
    ).resolves.toMatchObject({ ok: false, retryable: false });
  });

  it('opens the circuit after repeated outbound failures and then fast-fails', async () => {
    // 真实 SendSms 连续抛错：前 3 次实际调用累计失败到阈值，
    // 第 4 次熔断已打开 → 不再触达 client，直接可重试快速失败。
    const client = {
      SendSms: jest.fn().mockRejectedValue({ code: 'InternalError' }),
    };
    const breaker = new CircuitBreakerService();
    const channel = new TencentSmsChannel(
      client as any,
      {
        sdkAppId: 'appid',
        signName: '菜鸟驿站',
        templateMap: { PARCEL_STORED: 'tpl-1001' },
      },
      breaker,
    );

    const message = {
      channel: 'SMS' as const,
      content: 'ok',
      receiverPhone: '13800000000',
      templateCode: 'PARCEL_STORED',
      variables: ['1234'],
    };

    for (let i = 0; i < 3; i += 1) {
      await expect(channel.send(message)).resolves.toMatchObject({
        ok: false,
        retryable: true,
      });
    }
    // failureThreshold=3 已到，熔断打开。
    expect(breaker.snapshot('notify.tencent-sms.send')?.state).toBe('OPEN');
    expect(client.SendSms).toHaveBeenCalledTimes(3);

    await expect(channel.send(message)).resolves.toMatchObject({
      ok: false,
      retryable: true,
      error: 'sms circuit open',
    });
    // 熔断打开后不再触达真实 client。
    expect(client.SendSms).toHaveBeenCalledTimes(3);
  });
});

describe('SmsChannelFactory', () => {
  it('selects Tencent channel only when switchboard resolves tencent without degradation', async () => {
    const switchboard = {
      resolve: jest.fn().mockResolvedValue({
        provider: 'tencent',
        degraded: false,
      }),
    } as unknown as jest.Mocked<IntegrationConfigService>;
    const mock = new MockSmsChannel();
    const tencent = { channel: 'SMS', send: jest.fn() } as any;
    const factory = new SmsChannelFactory(switchboard, mock, tencent);

    await expect(factory.get()).resolves.toBe(tencent);
  });

  it('falls back to mock when switchboard degrades real SMS provider', async () => {
    const switchboard = {
      resolve: jest.fn().mockResolvedValue({
        provider: 'mock',
        degraded: true,
      }),
    } as unknown as jest.Mocked<IntegrationConfigService>;
    const mock = new MockSmsChannel();
    const tencent = { channel: 'SMS', send: jest.fn() } as any;
    const factory = new SmsChannelFactory(switchboard, mock, tencent);

    await expect(factory.get()).resolves.toBe(mock);
  });
});
