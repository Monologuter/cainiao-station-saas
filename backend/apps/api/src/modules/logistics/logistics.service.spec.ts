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

  it('accepts signed provider callbacks and deduplicates pushed nodes', async () => {
    const state: any = {
      order: {
        id: 'so1',
        tenantId: 't1',
        status: 'COLLECTED',
        waybillNo: 'K100-so1',
      },
      tracks: [
        {
          id: 'tr1',
          shipOrderId: 'so1',
          waybillNo: 'K100-so1',
          seq: 1,
          nodeStatus: 'COLLECTED',
          description: '【揽收】快件已由驿站揽收',
          happenedAt: new Date('2026-06-18T08:00:00Z'),
        },
      ],
    };
    const provider = {
      verifyCallback: jest.fn(() => true),
      parseCallbackTracks: jest.fn(() => [
        {
          nodeStatus: 'IN_TRANSIT',
          location: '杭州转运中心',
          description: '【运输中】快件离开始发城市',
          happenedAt: new Date('2026-06-18T10:00:00Z'),
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

    await expect(
      service.handleProviderCallback('t1', 'K100-so1', {
        payload: '{}',
        sign: 'valid',
      }),
    ).resolves.toMatchObject({ status: 'DELIVERED' });
    await service.handleProviderCallback('t1', 'K100-so1', {
      payload: '{}',
      sign: 'valid',
    });

    expect(state.tracks.map((track: any) => track.nodeStatus)).toEqual([
      'COLLECTED',
      'IN_TRANSIT',
      'DELIVERED',
    ]);
    expect(state.order.status).toBe('DELIVERED');
    expect(provider.verifyCallback).toHaveBeenCalledWith({
      payload: '{}',
      sign: 'valid',
    });
  });

  it('only advances a PAID order to COLLECTED once under repeated collect (idempotent second)', async () => {
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
    const tx = makeTx(state);
    const service = new LogisticsService(
      { withTenant: jest.fn(async (fn) => fn(tx)) } as any,
      new MockLogisticsProvider(),
    );

    const first = await TenantContext.run(
      { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
      () => service.collectShipOrder('so1'),
    );
    // 第二次（模拟并发重复揽收）：订单已为 COLLECTED，乐观锁守护下幂等返回。
    const second = await TenantContext.run(
      { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
      () => service.collectShipOrder('so1'),
    );

    expect(first.status).toBe('COLLECTED');
    expect(second.status).toBe('COLLECTED');
    expect(second.waybillNo).toBe(first.waybillNo);
    // 第一次走 updateMany 推进，第二次走 early-return（before.status===COLLECTED）。
    expect(tx.shipOrder.updateMany).toHaveBeenCalledTimes(1);
    expect(state.tracks).toHaveLength(1);
  });

  it('raises a conflict when the guarded status row was moved by a concurrent writer', async () => {
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
    const tx = makeTx(state);
    // 模拟并发推进：在本事务调用 updateMany 前，订单状态已被改成 CANCELLED，
    // 守护 WHERE(status:PAID) 不再命中 → count 0 → 抛冲突，绝不脏推进。
    tx.shipOrder.updateMany.mockImplementationOnce(async () => {
      state.order.status = 'CANCELLED';
      return { count: 0 };
    });
    const service = new LogisticsService(
      { withTenant: jest.fn(async (fn) => fn(tx)) } as any,
      new MockLogisticsProvider(),
    );

    await expect(
      TenantContext.run(
        { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
        () => service.collectShipOrder('so1'),
      ),
    ).rejects.toMatchObject({ code: ApiCode.IDEMPOTENCY_CONFLICT });
    expect(state.tracks).toHaveLength(0);
  });

  it('does not double-advance order status when getTracks runs concurrently', async () => {
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
      ]),
    };
    const tx = makeTx(state);
    const service = new LogisticsService(
      { withTenant: jest.fn(async (fn) => fn(tx)) } as any,
      provider as any,
    );

    await TenantContext.run(
      { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
      () => service.getTracks('so1'),
    );
    // 第二次轮询：已是 IN_TRANSIT，乐观锁守护下 updateMany 不再命中 COLLECTED。
    await TenantContext.run(
      { userId: 'u1', tenantId: 't1', roles: ['店长'], isPlatform: false },
      () => service.getTracks('so1'),
    );

    expect(state.order.status).toBe('IN_TRANSIT');
    // 仅第一次轮询触发一次状态推进。
    expect(tx.shipOrder.updateMany).toHaveBeenCalledTimes(1);
  });

  it('rejects forged provider callbacks', async () => {
    const state: any = {
      order: {
        id: 'so1',
        tenantId: 't1',
        status: 'COLLECTED',
        waybillNo: 'K100-so1',
      },
      tracks: [],
    };
    const service = new LogisticsService(
      { withTenant: jest.fn(async (fn) => fn(makeTx(state))) } as any,
      {
        verifyCallback: jest.fn(() => false),
        parseCallbackTracks: jest.fn(),
      } as any,
    );

    await expect(
      service.handleProviderCallback('t1', 'K100-so1', {
        payload: '{}',
        sign: 'bad',
      }),
    ).rejects.toMatchObject({ code: ApiCode.BAD_REQUEST });
  });
});

function makeTx(state: any) {
  return {
    shipOrder: {
      findFirst: jest.fn(async ({ where }) => {
        if (where.id && where.id !== state.order.id) return null;
        if (where.waybillNo && where.waybillNo !== state.order.waybillNo) {
          return null;
        }
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
      updateMany: jest.fn(async ({ where, data }) => {
        // 模拟乐观锁：仅当 WHERE 的 status 匹配当前态时生效一次。
        if (where.id && where.id !== state.order.id) return { count: 0 };
        if (where.status !== undefined && where.status !== state.order.status) {
          return { count: 0 };
        }
        const { version, ...rest } = data;
        state.order = {
          ...state.order,
          ...rest,
          version:
            (state.order.version ?? 0) +
            (version?.increment ? version.increment : 0),
        };
        return { count: 1 };
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
