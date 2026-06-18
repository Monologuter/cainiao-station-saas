import { MonitorService } from './monitor.service';

/**
 * FUNC-8a：门店 online 不再恒为 true，而是按「最近活动窗口内是否存在包裹活动」派生。
 * 这里用一个最小的 tx stub 驱动 stationSummary（经由 storeDetail），断言：
 *  - 近期有包裹活动（parcel.findFirst 命中） → online=true，health.reasons 不含 'offline'
 *  - 近期无包裹活动（parcel.findFirst 返回 null） → online=false，health.reasons 含 'offline'
 */
describe('MonitorService online derivation (FUNC-8a)', () => {
  function buildService(recentActivity: { updatedAt: Date } | null) {
    const station = {
      id: 's1',
      tenantId: 't1',
      name: '测试门店',
      code: 'ST-1',
      tenant: { name: '测试租户' },
    };
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
      station: { findUnique: jest.fn().mockResolvedValue(station) },
      parcel: {
        count: jest.fn().mockResolvedValue(0),
        // stationSummary 里唯一的 parcel.findFirst 调用就是「近期活动」查询。
        findFirst: jest.fn().mockResolvedValue(recentActivity),
      },
      exceptionTicket: { count: jest.fn().mockResolvedValue(0) },
      shipOrder: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { quoteAmount: null } }),
      },
      subscription: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'sub1', status: 'ACTIVE', currentPeriodEnd: null }),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    return { service: new MonitorService(prisma as any), tx };
  }

  it('marks the station online when there is recent parcel activity', async () => {
    const { service, tx } = buildService({ updatedAt: new Date() });

    const detail = await service.storeDetail('s1');

    expect(detail.online).toBe(true);
    expect(detail.health.reasons).not.toContain('offline');
    // 近期活动查询带了 updatedAt >= 窗口起点的过滤条件。
    const activityCall = tx.parcel.findFirst.mock.calls[0][0];
    expect(activityCall.where.stationId).toBe('s1');
    expect(activityCall.where.updatedAt.gte).toBeInstanceOf(Date);
  });

  it('marks the station offline when no recent parcel activity exists', async () => {
    const { service } = buildService(null);

    const detail = await service.storeDetail('s1');

    expect(detail.online).toBe(false);
    expect(detail.health.reasons).toContain('offline');
  });
});
