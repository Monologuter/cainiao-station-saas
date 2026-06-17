import { QueryService } from './query.service';

function createQueryService(redisData: any = {}) {
  const client = {
    hgetall: jest.fn(async (key: string) => redisData.hashes?.[key] ?? {}),
    get: jest.fn(async (key: string) => redisData.strings?.[key] ?? null),
  };
  const redis = { getClient: () => client } as any;
  const tx = {
    parcel: { count: jest.fn() },
    metricDaily: { findMany: jest.fn() },
    shelf: { findMany: jest.fn() },
    slot: { groupBy: jest.fn() },
    notification: { count: jest.fn().mockResolvedValue(0) },
  };
  const tenantPrisma = { withTenant: (fn: any) => fn(tx) } as any;
  return { service: new QueryService(tenantPrisma, redis), tx, client };
}

describe('QueryService', () => {
  it('returns overview from redis hot counters', async () => {
    const { service } = createQueryService({
      hashes: {
        'an:cnt:t1:s1:2026-06-18': {
          inbound: '10',
          pickup: '6',
          overdue: '2',
          exception: '1',
          ship_paid: '3',
          ship_gmv: '4500',
        },
      },
      strings: { 'an:stored:t1:s1': '4' },
    });

    await expect(
      service.overview({
        tenantId: 't1',
        stationId: 's1',
        date: new Date('2026-06-18T10:00:00.000Z'),
      }),
    ).resolves.toMatchObject({
      inbound: 10,
      pickup: 6,
      stored: 4,
      pickupRate: 60,
      overdueCount: 2,
      exceptionCount: 1,
      shipPaid: 3,
      gmv: 4500,
    });
  });

  it('fills missing trend days from metric_daily', async () => {
    const { service, tx } = createQueryService();
    tx.metricDaily.findMany.mockResolvedValue([
      { statDate: new Date('2026-06-18T00:00:00.000Z'), value: BigInt(5) },
    ]);

    await expect(
      service.trend({
        tenantId: 't1',
        metric: 'inbound',
        from: new Date('2026-06-17T00:00:00.000Z'),
        to: new Date('2026-06-18T00:00:00.000Z'),
      }),
    ).resolves.toEqual({
      metric: 'inbound',
      points: [
        { date: '2026-06-17', value: 0 },
        { date: '2026-06-18', value: 5 },
      ],
    });
  });

  it('builds shelf heatmap from shelf capacities and occupied slots', async () => {
    const { service, tx } = createQueryService();
    tx.shelf.findMany.mockResolvedValue([
      { id: 'sh1', code: 'A', slots: [{ id: 'sl1' }, { id: 'sl2' }] },
    ]);
    tx.slot.groupBy.mockResolvedValue([
      { shelfId: 'sh1', _count: { _all: 1 } },
    ]);

    await expect(
      service.heatmap({ tenantId: 't1', stationId: 's1' }),
    ).resolves.toEqual({
      shelves: [{ shelfCode: 'A', used: 1, capacity: 2, rate: 0.5 }],
    });
  });
});
