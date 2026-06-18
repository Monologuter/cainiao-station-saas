import { IntegrationConfigService } from '../config/integration-config.service';
import { KuaiDi100Provider } from './kuaidi100.provider';
import { LogisticsProviderFactory } from './logistics-provider.factory';
import { MockLogisticsProvider } from './mock-logistics.provider';

describe('KuaiDi100Provider', () => {
  it('verifies callback sign and maps provider tracks to system nodes', async () => {
    const client = {
      queryTrack: jest.fn().mockResolvedValue({
        data: [
          {
            status: '在途',
            context: '快件到达杭州转运中心',
            time: '2026-06-18 10:00:00',
            areaName: '杭州',
          },
          {
            status: '签收',
            context: '已签收',
            time: '2026-06-19 18:00:00',
            areaName: '深圳',
          },
        ],
      }),
    };
    const provider = new KuaiDi100Provider(client as any, {
      key: 'secret',
      customer: 'customer-1',
    });
    const payload = '{"lastResult":"ok"}';

    expect(
      provider.verifyCallback({
        payload,
        sign: provider.sign(payload),
      }),
    ).toBe(true);
    expect(provider.verifyCallback({ payload, sign: 'bad' })).toBe(false);

    await expect(provider.pollTracks('YT001')).resolves.toEqual([
      {
        nodeStatus: 'ARRIVED',
        location: '杭州',
        description: '快件到达杭州转运中心',
        happenedAt: new Date('2026-06-18T10:00:00.000+08:00'),
      },
      {
        nodeStatus: 'DELIVERED',
        location: '深圳',
        description: '已签收',
        happenedAt: new Date('2026-06-19T18:00:00.000+08:00'),
      },
    ]);
  });

  it('creates deterministic waybill placeholder for provider-created orders', async () => {
    const provider = new KuaiDi100Provider({ queryTrack: jest.fn() } as any, {
      key: 'secret',
      customer: 'customer-1',
    });

    await expect(
      provider.createWaybill({ shipOrderId: 'so1', courierCode: 'YTO' } as any),
    ).resolves.toEqual({ waybillNo: 'K100-so1' });
  });
});

describe('LogisticsProviderFactory', () => {
  it('selects kuaidi100 only when switchboard resolves it without degradation', async () => {
    const integrations = {
      resolve: jest.fn().mockResolvedValue({
        provider: 'kuaidi100',
        degraded: false,
      }),
    } as unknown as jest.Mocked<IntegrationConfigService>;
    const mock = new MockLogisticsProvider();
    const kuaidi100 = { code: 'kuaidi100' } as any;

    await expect(
      new LogisticsProviderFactory(integrations, mock, kuaidi100).get(),
    ).resolves.toBe(kuaidi100);
  });
});
