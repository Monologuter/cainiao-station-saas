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
});
