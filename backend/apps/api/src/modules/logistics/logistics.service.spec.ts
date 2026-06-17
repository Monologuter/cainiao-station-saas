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
      create: jest.fn(async ({ data }) => {
        const track = { id: 'tr1', ...data };
        state.tracks.push(track);
        return track;
      }),
    },
  };
}
