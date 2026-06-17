import { analyticsKeys } from './keys';
import { MetricsService } from './metrics.service';

function createService() {
  const client = {
    sadd: jest.fn(),
    expire: jest.fn(),
    hincrby: jest.fn(),
    zincrby: jest.fn(),
    incrby: jest.fn(),
  };
  const redis = { getClient: () => client } as any;
  return { service: new MetricsService(redis), client };
}

describe('analytics keys', () => {
  it('builds stable redis keys', () => {
    expect(analyticsKeys.count('t1', 's1', '2026-06-18')).toBe(
      'an:cnt:t1:s1:2026-06-18',
    );
    expect(analyticsKeys.stored('t1', 's1')).toBe('an:stored:t1:s1');
    expect(analyticsKeys.stationRank('t1', 'inbound', '2026-06-18')).toBe(
      'an:rank:station:t1:inbound:2026-06-18',
    );
  });
});

describe('MetricsService', () => {
  it('increments metric once per event id and updates station/platform ranks', async () => {
    const { service, client } = createService();
    client.sadd.mockResolvedValue(1);
    client.hincrby.mockResolvedValue(3);

    await service.incr({
      tenantId: 't1',
      stationId: 's1',
      metric: 'inbound',
      by: 3,
      eventId: 'evt-1',
      at: new Date('2026-06-18T10:00:00.000Z'),
    });

    expect(client.sadd).toHaveBeenCalledWith('an:dedup:2026-06-18', 'evt-1');
    expect(client.expire).toHaveBeenCalledWith(
      'an:dedup:2026-06-18',
      35 * 86400,
    );
    expect(client.hincrby).toHaveBeenCalledWith(
      'an:cnt:t1:s1:2026-06-18',
      'inbound',
      3,
    );
    expect(client.hincrby).toHaveBeenCalledWith(
      'an:plat:cnt:2026-06-18',
      'inbound',
      3,
    );
    expect(client.zincrby).toHaveBeenCalledWith(
      'an:rank:station:t1:inbound:2026-06-18',
      3,
      's1',
    );
  });

  it('skips duplicate events before touching counters', async () => {
    const { service, client } = createService();
    client.sadd.mockResolvedValue(0);

    await service.incr({
      tenantId: 't1',
      stationId: 's1',
      metric: 'inbound',
      eventId: 'evt-dup',
      at: new Date('2026-06-18T10:00:00.000Z'),
    });

    expect(client.hincrby).not.toHaveBeenCalled();
    expect(client.zincrby).not.toHaveBeenCalled();
  });

  it('adjusts stored snapshot by delta', async () => {
    const { service, client } = createService();
    client.incrby.mockResolvedValue(8);

    await expect(
      service.adjustStored({ tenantId: 't1', stationId: 's1', delta: -1 }),
    ).resolves.toBe(8);

    expect(client.incrby).toHaveBeenCalledWith('an:stored:t1:s1', -1);
  });
});
