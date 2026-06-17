import { ApiCode } from '../../core/http/api-code';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { LogisticsService } from './logistics.service';
import { MockLogisticsProvider } from './mock-logistics.provider';

describe('LogisticsService', () => {
  it('collects a PAID order with waybill and first track node', async () => {
    const state: any = {
      order: {
        id: 'so1',
        tenantId: 't1',
        status: 'PAID',
        courierCode: 'YTO',
        senderJson: { name: '张三' },
        receiverJson: { name: '李四' },
        weightGram: 1200,
        version: 1,
      },
      tracks: [] as any[],
    };
    const service = new LogisticsService(
      { withTenant: jest.fn(async (fn) => fn(makeTx(state))) } as any,
      new MockLogisticsProvider(),
    );

    const result = await TenantContext.run(
      { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
      () => service.collectShipOrder('so1'),
    );

    expect(result.status).toBe('COLLECTED');
    expect(result.waybillNo).toMatch(/^MOCK/);
    expect(state.tracks).toEqual([
      expect.objectContaining({
        tenantId: 't1',
        shipOrderId: 'so1',
        seq: 1,
        nodeStatus: 'COLLECTED',
        source: 'MOCK',
      }),
    ]);
  });

  it('returns existing collected order without duplicating first track', async () => {
    const state: any = {
      order: {
        id: 'so1',
        tenantId: 't1',
        status: 'COLLECTED',
        waybillNo: 'MOCK001',
      },
      tracks: [{ id: 'tr1', shipOrderId: 'so1', seq: 1 }],
    };
    const provider = { createWaybill: jest.fn() };
    const service = new LogisticsService(
      { withTenant: jest.fn(async (fn) => fn(makeTx(state))) } as any,
      provider as any,
    );

    const result = await TenantContext.run(
      { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
      () => service.collectShipOrder('so1'),
    );

    expect(result.waybillNo).toBe('MOCK001');
    expect(state.tracks).toHaveLength(1);
    expect(provider.createWaybill).not.toHaveBeenCalled();
  });

  it('rejects orders that are not PAID or already COLLECTED', async () => {
    const state: any = {
      order: { id: 'so1', tenantId: 't1', status: 'CREATED' },
      tracks: [],
    };
    const service = new LogisticsService(
      { withTenant: jest.fn(async (fn) => fn(makeTx(state))) } as any,
      new MockLogisticsProvider(),
    );

    await expect(
      TenantContext.run(
        { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
        () => service.collectShipOrder('so1'),
      ),
    ).rejects.toMatchObject({
      code: ApiCode.SHIPPING_ILLEGAL_TRANSITION,
    });
  });

  it('materializes mock track nodes and moves order to DELIVERED', async () => {
    const state: any = {
      order: {
        id: 'so1',
        tenantId: 't1',
        status: 'COLLECTED',
        waybillNo: 'MOCK001',
      },
      tracks: [
        {
          id: 'tr1',
          shipOrderId: 'so1',
          waybillNo: 'MOCK001',
          seq: 1,
          nodeStatus: 'COLLECTED',
        },
      ],
    };
    const provider = {
      pollTracks: jest.fn().mockResolvedValue([
        {
          nodeStatus: 'IN_TRANSIT',
          location: '杭州转运中心',
          description: '【运输中】快件离开始发城市',
          happenedAt: new Date('2026-06-18T08:00:00Z'),
        },
        {
          nodeStatus: 'DELIVERED',
          location: '深圳南山',
          description: '【签收】快件已签收',
          happenedAt: new Date('2026-06-18T18:00:00Z'),
        },
      ]),
    };
    const service = new LogisticsService(
      { withTenant: jest.fn(async (fn) => fn(makeTx(state))) } as any,
      provider as any,
    );

    const tracks = await TenantContext.run(
      { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
      () => service.getTracks('so1'),
    );

    expect(tracks.map((track: any) => track.nodeStatus)).toEqual([
      'COLLECTED',
      'IN_TRANSIT',
      'DELIVERED',
    ]);
    expect(state.order.status).toBe('DELIVERED');
    expect(state.order.deliveredAt).toEqual(new Date('2026-06-18T18:00:00Z'));
  });
});

function makeTx(state: any) {
  return {
    shipOrder: {
      findFirst: jest.fn(async ({ where }) => {
        if (where.id !== state.order.id) return null;
        if (where.tenantId && where.tenantId !== state.order.tenantId) {
          return null;
        }
        return state.order;
      }),
      update: jest.fn(async ({ data }) => {
        state.order = {
          ...state.order,
          ...data,
          version: (state.order.version ?? 0) + 1,
        };
        return state.order;
      }),
    },
    logisticsTrack: {
      findMany: jest.fn(async () =>
        [...state.tracks].sort((a, b) => a.seq - b.seq),
      ),
      create: jest.fn(async ({ data }) => {
        const track = { id: 'tr1', ...data };
        state.tracks.push(track);
        return track;
      }),
    },
  };
}
