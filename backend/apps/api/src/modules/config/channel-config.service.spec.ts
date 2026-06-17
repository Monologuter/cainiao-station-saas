import { ApiCode } from '../../core/http/api-code';
import { ChannelResolver } from './channel-resolver';
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

  it('rejects real providers before P4-4 adapters are implemented', async () => {
    const configs = {
      get: jest.fn().mockResolvedValue({
        channel: 'sms',
        provider: 'tencent',
        enabled: true,
        fallbackProvider: 'mock',
      }),
    };
    const resolver = new ChannelResolver(configs as any);

    await expect(resolver.resolve('sms')).rejects.toMatchObject({
      code: ApiCode.NOT_IMPLEMENTED,
    });
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
