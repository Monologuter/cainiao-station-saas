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
