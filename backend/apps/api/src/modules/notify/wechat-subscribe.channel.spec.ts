import { IntegrationConfigService } from '../config/integration-config.service';
import { InAppChannel } from './in-app.channel';
import { WechatSubscribeAuthService } from './wechat-subscribe-auth.service';
import { WechatSubscribeChannel } from './wechat-subscribe.channel';
import { WechatSubscribeChannelFactory } from './wechat-subscribe.factory';

describe('WechatSubscribeAuthService', () => {
  it('grants and consumes one subscribe-message authorization quota', async () => {
    const tx = {
      wechatSubscribeAuthorization: {
        upsert: jest.fn().mockResolvedValue({ remainingCount: 2 }),
        findFirst: jest.fn().mockResolvedValue({
          id: 'auth-1',
          openid: 'openid-1',
          remainingCount: 2,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const tenantPrisma = { withTenant: (fn: any) => fn(tx) } as any;
    const service = new WechatSubscribeAuthService(tenantPrisma);

    await expect(
      service.grant({
        tenantId: 't1',
        consumerId: 'c1',
        openid: 'openid-1',
        templateId: 'tpl-1',
        count: 2,
      }),
    ).resolves.toMatchObject({ remainingCount: 2 });
    await expect(
      service.consume({
        tenantId: 't1',
        consumerId: 'c1',
        templateId: 'tpl-1',
      }),
    ).resolves.toEqual({ ok: true, openid: 'openid-1' });
    expect(tx.wechatSubscribeAuthorization.updateMany).toHaveBeenCalledWith({
      where: { id: 'auth-1', remainingCount: { gt: 0 } },
      data: { remainingCount: { decrement: 1 } },
    });
  });
});

describe('WechatSubscribeChannel', () => {
  it('sends subscribe message after consuming authorization quota', async () => {
    const client = {
      sendSubscribeMessage: jest
        .fn()
        .mockResolvedValue({ errcode: 0, msgid: 'm1' }),
    };
    const auth = {
      consume: jest.fn().mockResolvedValue({ ok: true, openid: 'openid-1' }),
    };
    const channel = new WechatSubscribeChannel(client as any, auth as any, {
      templateMap: { PARCEL_STORED: 'tpl-1' },
      pageMap: { PARCEL_STORED: 'pages/parcels/index' },
    });

    await expect(
      channel.send({
        channel: 'WECHAT',
        content: '取件码1234',
        templateCode: 'PARCEL_STORED',
        consumerId: 'c1',
        tenantId: 't1',
        variables: ['1234', 'A-01'],
      }),
    ).resolves.toEqual({ ok: true, providerRequestId: 'm1' });
    expect(client.sendSubscribeMessage).toHaveBeenCalledWith({
      touser: 'openid-1',
      template_id: 'tpl-1',
      page: 'pages/parcels/index',
      data: {
        thing1: { value: '1234' },
        thing2: { value: 'A-01' },
      },
    });
  });

  it('falls back cleanly when user has no remaining authorization quota', async () => {
    const channel = new WechatSubscribeChannel(
      { sendSubscribeMessage: jest.fn() } as any,
      { consume: jest.fn().mockResolvedValue({ ok: false }) } as any,
      { templateMap: { PARCEL_STORED: 'tpl-1' }, pageMap: {} },
    );

    await expect(
      channel.send({
        channel: 'WECHAT',
        content: '取件码1234',
        templateCode: 'PARCEL_STORED',
        consumerId: 'c1',
        tenantId: 't1',
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: 'NO_AUTHORIZATION',
      retryable: false,
    });
  });
});

describe('WechatSubscribeChannelFactory', () => {
  it('selects wechat provider only when switchboard resolves it without degradation', async () => {
    const switchboard = {
      resolve: jest
        .fn()
        .mockResolvedValue({ provider: 'wechat', degraded: false }),
    } as unknown as jest.Mocked<IntegrationConfigService>;
    const fallback = new InAppChannel();
    const wechat = { channel: 'WECHAT', send: jest.fn() } as any;

    await expect(
      new WechatSubscribeChannelFactory(switchboard, fallback, wechat).get(),
    ).resolves.toBe(wechat);
  });
});
