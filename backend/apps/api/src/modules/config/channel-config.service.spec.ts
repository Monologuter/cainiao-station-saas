import { ChannelResolver } from './channel-resolver';
import { CallbackSecurityService } from './callback-security.service';
import { IntegrationConfigService } from './integration-config.service';
import { ProviderRegistry } from './provider-registry';

describe('ChannelResolver', () => {
  it('resolves mock providers from runtime channel config', async () => {
    const configs = {
      get: jest.fn().mockResolvedValue({
        channel: 'sms',
        provider: 'mock',
        enabled: true,
        fallbackProvider: 'mock',
      }),
    };
    const resolver = new ChannelResolver(configs as any);

    await expect(resolver.resolve('sms')).resolves.toMatchObject({
      channel: 'sms',
      provider: 'mock',
    });
  });

  it('resolves real providers after P4-4 switchboard is available', async () => {
    const configs = {
      get: jest.fn().mockResolvedValue({
        channel: 'sms',
        provider: 'tencent',
        enabled: true,
        fallbackProvider: 'mock',
      }),
    };
    const resolver = new ChannelResolver(configs as any);

    await expect(resolver.resolve('sms')).resolves.toMatchObject({
      channel: 'sms',
      provider: 'tencent',
    });
  });
});

describe('IntegrationConfigService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('prefers DB channel switch over env provider', async () => {
    process.env.NOTIFY_SMS_PROVIDER = 'mock';
    process.env.TENCENT_SMS_SECRET_ID = 'sid';
    process.env.TENCENT_SMS_SECRET_KEY = 'skey';
    process.env.TENCENT_SMS_SDK_APP_ID = 'appid';
    process.env.TENCENT_SMS_SIGN_NAME = '菜鸟驿站';
    const channels = {
      get: jest.fn().mockResolvedValue({
        channel: 'sms',
        provider: 'tencent',
        enabled: true,
        fallbackProvider: 'mock',
      }),
    };
    const service = new IntegrationConfigService(channels as any);

    await expect(service.resolve('sms')).resolves.toMatchObject({
      kind: 'sms',
      channel: 'sms',
      provider: 'tencent',
      degraded: false,
    });
  });

  it('uses env provider when channel config is unavailable', async () => {
    process.env.LOGISTICS_PROVIDER = 'kuaidi100';
    process.env.KUAIDI100_KEY = 'k100-key';
    process.env.KUAIDI100_CUSTOMER = 'customer';
    const channels = { get: jest.fn().mockRejectedValue(new Error('missing')) };
    const service = new IntegrationConfigService(channels as any);

    await expect(service.resolve('logistics')).resolves.toMatchObject({
      kind: 'logistics',
      provider: 'kuaidi100',
      source: 'env',
    });
  });

  it('falls back safely when real provider secrets are missing', async () => {
    const channels = {
      get: jest.fn().mockResolvedValue({
        channel: 'sms',
        provider: 'tencent',
        enabled: true,
        fallbackProvider: 'mock',
      }),
    };
    const service = new IntegrationConfigService(channels as any);

    await expect(service.resolve('sms')).resolves.toMatchObject({
      provider: 'mock',
      degraded: true,
      degradeReason: expect.stringContaining('TENCENT_SMS_SECRET_ID'),
    });
  });
});

describe('CallbackSecurityService', () => {
  it('verifies hmac signatures and rejects replayed nonce', () => {
    const service = new CallbackSecurityService(() => 100_000);
    const payload = '{"out_trade_no":"p1"}';
    const signature = service.signHmac({
      payload,
      timestamp: '100',
      nonce: 'n1',
      secret: 'secret',
    });

    expect(
      service.verifyHmac({
        payload,
        timestamp: '100',
        nonce: 'n1',
        signature,
        secret: 'secret',
      }),
    ).toEqual({ ok: true });
    expect(
      service.verifyHmac({
        payload,
        timestamp: '100',
        nonce: 'n1',
        signature,
        secret: 'secret',
      }),
    ).toMatchObject({ ok: false, reason: 'REPLAYED_NONCE' });
  });

  it('rejects stale timestamps and bad signatures', () => {
    const service = new CallbackSecurityService(() => 700_000);

    expect(
      service.verifyHmac({
        payload: '{}',
        timestamp: '1',
        nonce: 'n2',
        signature: 'bad',
        secret: 'secret',
      }),
    ).toMatchObject({ ok: false, reason: 'STALE_TIMESTAMP' });

    expect(
      service.verifyHmac({
        payload: '{}',
        timestamp: '700',
        nonce: 'n3',
        signature: 'bad',
        secret: 'secret',
      }),
    ).toMatchObject({ ok: false, reason: 'BAD_SIGNATURE' });
  });
});

describe('ProviderRegistry', () => {
  it('validates provider names per channel', () => {
    const registry = new ProviderRegistry();

    expect(registry.providersFor('sms')).toEqual(['mock', 'tencent']);
    expect(registry.isRegistered('sms', 'mock')).toBe(true);
    expect(registry.isRegistered('sms', 'kuaidi100')).toBe(false);
  });
});
