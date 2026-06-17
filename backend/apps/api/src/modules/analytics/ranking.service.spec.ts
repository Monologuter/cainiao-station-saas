import { RankingService } from './ranking.service';

describe('RankingService', () => {
  it('returns overdue top from redis zset', async () => {
    const client = {
      zrange: jest.fn().mockResolvedValue(['p1', '1718600000000']),
    };
    const service = new RankingService(
      { getClient: () => client } as any,
      {} as any,
    );

    await expect(
      service.overdueTop({ tenantId: 't1', stationId: 's1', limit: 1 }),
    ).resolves.toEqual({
      type: 'overdue',
      items: [{ key: 'p1', label: 'p1', value: 1718600000000, extra: {} }],
    });
  });

  it('returns station comparison from redis zset', async () => {
    const client = {
      zrevrange: jest.fn().mockResolvedValue(['s1', '12', 's2', '8']),
    };
    const service = new RankingService(
      { getClient: () => client } as any,
      {} as any,
    );

    await expect(
      service.stationCompare({
        tenantId: 't1',
        metric: 'inbound',
        date: new Date('2026-06-18T00:00:00.000Z'),
      }),
    ).resolves.toEqual({
      metric: 'inbound',
      rows: [
        { stationId: 's1', name: 's1', value: 12 },
        { stationId: 's2', name: 's2', value: 8 },
      ],
    });
  });
});
