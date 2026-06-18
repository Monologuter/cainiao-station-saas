import { EventBus } from '../../core/event-bus/event-bus';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { ShippingService } from './shipping.service';

describe('ShippingService', () => {
  it('creates a CREATED order with quote snapshot and publishes ShipOrderCreated', async () => {
    const created: any = {};
    const tenantPrisma = {
      withTenant: jest.fn(async (fn) =>
        fn({
          shipOrder: {
            create: jest.fn(async ({ data }) => {
              created.order = { id: 'so1', ...data };
              return created.order;
            }),
          },
        }),
      ),
    };
    const courierSelector = {
      rank: jest.fn(),
      resolveZone: jest.fn().mockReturnValue('CROSS_PROVINCE'),
    };
    const pricing = {
      quote: jest.fn().mockResolvedValue({
        courierCode: 'YTO',
        courierName: '圆通速递',
        zone: 'CROSS_PROVINCE',
        amount: 1300,
        estHours: 60,
        ruleId: 'rule1',
        breakdown: {
          firstPrice: 600,
          addWeightUnits: 1,
          addPrice: 400,
          subtotal: 1000,
          zoneFactor: 1.3,
          total: 1300,
        },
      }),
    };
    const eventBus = { publish: jest.fn() };
    const service = new ShippingService(
      courierSelector as any,
      pricing as any,
      tenantPrisma as any,
      eventBus as any,
    );

    const result = await TenantContext.run(
      {
        userId: '00000000-0000-4000-8000-000000000001',
        tenantId: 't1',
        roles: ['店长'],
        isPlatform: false,
      },
      () =>
        service.createOrder({
          channel: 'STATION',
          stationId: 's1',
          courierCode: 'YTO',
          sender: {
            name: '张三',
            phone: '13800000000',
            province: '浙江省',
            city: '杭州市',
            district: '西湖区',
            address: '文三路 1 号',
          },
          receiver: {
            name: '李四',
            phone: '13900000000',
            province: '广东省',
            city: '深圳市',
            district: '南山区',
            address: '科技园 2 号',
          },
          item: { type: '文件', weightGram: 1200 },
        }),
    );

    expect(result).toMatchObject({ id: 'so1', status: 'CREATED' });
    expect(pricing.quote).toHaveBeenCalledWith('YTO', 'CROSS_PROVINCE', 1200);
    expect(created.order).toMatchObject({
      tenantId: 't1',
      stationId: 's1',
      channel: 'STATION',
      status: 'CREATED',
      courierCode: 'YTO',
      courierName: '圆通速递',
      quoteAmount: 1300,
      createdBy: '00000000-0000-4000-8000-000000000001',
    });
    expect(created.order.quoteSnapshotJson).toMatchObject({
      zone: 'CROSS_PROVINCE',
      amount: 1300,
      breakdown: { total: 1300 },
    });
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ShipOrderCreated',
        payload: expect.objectContaining({
          tenantId: 't1',
          shipOrderId: 'so1',
          quoteAmount: 1300,
          courierCode: 'YTO',
        }),
      }),
    );
  });

  it('applies a member shipping coupon and stores payable amount in quote snapshot', async () => {
    let orderState: any;
    const tenantPrisma = {
      withTenant: jest.fn(async (fn) =>
        fn({
          shipOrder: {
            create: jest.fn(async ({ data }) => {
              orderState = { id: 'so1', ...data };
              return orderState;
            }),
            update: jest.fn(async ({ data }) => {
              orderState = { ...orderState, ...data };
              return orderState;
            }),
          },
        }),
      ),
    };
    const service = new ShippingService(
      {
        resolveZone: jest.fn().mockReturnValue('LOCAL'),
      } as any,
      {
        quote: jest.fn().mockResolvedValue({
          courierCode: 'YTO',
          courierName: '圆通速递',
          amount: 1300,
          estHours: 24,
          ruleId: 'rule1',
          breakdown: { total: 1300 },
        }),
      } as any,
      tenantPrisma as any,
      { publish: jest.fn() } as any,
      {
        $transaction: jest.fn((fn) =>
          fn({
            $executeRawUnsafe: jest.fn(),
            member: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'm1' }) },
          }),
        ),
      } as any,
      {
        verifyForMember: jest.fn().mockResolvedValue({
          template: {
            id: 'tpl1',
            type: 'DISCOUNT',
            scene: 'SHIP',
            faceValue: '5',
            threshold: '0',
          },
        }),
      } as any,
    );

    const result = await TenantContext.run(
      { userId: 'consumer', tenantId: 't1', roles: [], isPlatform: false },
      () =>
        service.createOrder({
          channel: 'ONLINE',
          stationId: 's1',
          courierCode: 'YTO',
          couponId: 'coupon-1',
          sender: {
            name: '张三',
            phone: '13800000000',
            province: '浙江省',
            city: '杭州市',
            district: '西湖区',
            address: '文三路 1 号',
          },
          receiver: {
            name: '李四',
            phone: '13900000000',
            province: '浙江省',
            city: '杭州市',
            district: '西湖区',
            address: '古墩路 2 号',
          },
          item: { type: '文件', weightGram: 500 },
          consumerId: 'consumer-1',
        } as any),
    );

    expect(result.quoteAmount).toBe(800);
    expect(result.quoteSnapshotJson.coupon).toMatchObject({
      couponId: 'coupon-1',
      originalAmount: 1300,
      discountAmount: 500,
      payableAmount: 800,
    });
  });

  it('cancels CREATED shipping orders', async () => {
    const updated = { id: 'so1', tenantId: 't1', status: 'CANCELLED' };
    const service = new ShippingService(
      {} as any,
      {} as any,
      {
        withTenant: jest.fn((fn) =>
          fn({
            shipOrder: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'so1',
                tenantId: 't1',
                status: 'CREATED',
              }),
              update: jest.fn().mockResolvedValue(updated),
            },
          }),
        ),
      } as any,
      {} as any,
    );

    await expect(
      service.cancelOrder('so1', { userId: 'u1', tenantId: 't1' }),
    ).resolves.toMatchObject({ id: 'so1', status: 'CANCELLED' });
  });
});

describe('ShippingService.listOrders 门店数据范围', () => {
  function makeService() {
    const lastWhere: any = {};
    const tenantPrisma = {
      withTenant: jest.fn(async (fn) =>
        fn({
          shipOrder: {
            count: jest.fn(async ({ where }: any) => {
              lastWhere.value = where;
              return 0;
            }),
            findMany: jest.fn(async ({ where }: any) => {
              lastWhere.value = where;
              return [];
            }),
          },
        }),
      ),
    };
    const service = new ShippingService(
      {} as any,
      {} as any,
      tenantPrisma as any,
      {} as any,
    );
    return { service, lastWhere };
  }

  it('店员不传 stationId → 收敛为被分配门店集合', async () => {
    const { service, lastWhere } = makeService();
    await service.listOrders(
      {},
      {
        userId: 'u1',
        tenantId: 't1',
        roles: ['店员'],
        isPlatform: false,
        allStations: false,
        stations: ['s1', 's2'],
      },
    );
    expect(lastWhere.value.stationId).toEqual({ in: ['s1', 's2'] });
  });

  it('店员传被分配门店 → 仅该门店', async () => {
    const { service, lastWhere } = makeService();
    await service.listOrders(
      { stationId: 's2' },
      {
        userId: 'u1',
        tenantId: 't1',
        roles: ['店员'],
        isPlatform: false,
        allStations: false,
        stations: ['s1', 's2'],
      },
    );
    expect(lastWhere.value.stationId).toBe('s2');
  });

  it('店员传非分配门店 → 拒绝（越权）', async () => {
    const { service } = makeService();
    await expect(
      service.listOrders(
        { stationId: 's9' },
        {
          userId: 'u1',
          tenantId: 't1',
          roles: ['店员'],
          isPlatform: false,
          allStations: false,
          stations: ['s1', 's2'],
        },
      ),
    ).rejects.toThrow('无权访问该门店数据');
  });

  it('店长可见全租户门店 → 不带入参时不追加 stationId 过滤', async () => {
    const { service, lastWhere } = makeService();
    await service.listOrders(
      {},
      {
        userId: 'boss',
        tenantId: 't1',
        roles: ['店长'],
        isPlatform: false,
        allStations: true,
        stations: [],
      },
    );
    expect(lastWhere.value.stationId).toBeUndefined();
    expect(lastWhere.value.tenantId).toBe('t1');
  });
});
