import { MultiLevelCacheService } from './multi-level-cache.service';

class FakeRedis {
  store = new Map<string, string>();
  get = jest.fn((key: string) => Promise.resolve(this.store.get(key) ?? null));
  set = jest.fn((key: string, value: string) => {
    this.store.set(key, value);
    return Promise.resolve('OK');
  });
  del = jest.fn((key: string) => {
    this.store.delete(key);
    return Promise.resolve(1);
  });
  publish = jest.fn(() => Promise.resolve(1));
}

function createCache(redis = new FakeRedis()) {
  return {
    redis,
    cache: new MultiLevelCacheService({ getClient: () => redis } as any),
  };
}

describe('MultiLevelCacheService', () => {
  it('returns L1 hits without visiting Redis or loader', async () => {
    const { cache, redis } = createCache();
    const loader = jest.fn().mockResolvedValue({ label: 'YTO' });

    await cache.getOrLoad('dict:carrier', 1000, loader);
    await expect(
      cache.getOrLoad('dict:carrier', 1000, loader),
    ).resolves.toEqual({ label: 'YTO' });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(redis.get).toHaveBeenCalledTimes(1);
  });

  it('hydrates L1 from L2 hits', async () => {
    const redis = new FakeRedis();
    redis.store.set(
      'channel:sms',
      JSON.stringify({ value: { provider: 'mock' } }),
    );
    const { cache } = createCache(redis);
    const loader = jest.fn();

    await expect(cache.getOrLoad('channel:sms', 1000, loader)).resolves.toEqual(
      {
        provider: 'mock',
      },
    );
    await cache.getOrLoad('channel:sms', 1000, loader);

    expect(loader).not.toHaveBeenCalled();
    expect(redis.get).toHaveBeenCalledTimes(1);
  });

  it('loads from source and fills L2/L1 on misses', async () => {
    const { cache, redis } = createCache();
    const loader = jest.fn().mockResolvedValue(['A']);

    await expect(cache.getOrLoad('dict:zone', 1000, loader)).resolves.toEqual([
      'A',
    ]);

    expect(redis.set).toHaveBeenCalledWith(
      'dict:zone',
      JSON.stringify({ value: ['A'] }),
      'PX',
      expect.any(Number),
    );
  });

  it('caches null values with a short ttl', async () => {
    const { cache, redis } = createCache();
    const loader = jest.fn().mockResolvedValue(null);

    await expect(
      cache.getOrLoad('missing', 1000, loader, 50),
    ).resolves.toBeNull();

    expect(redis.set).toHaveBeenCalledWith(
      'missing',
      JSON.stringify({ value: null }),
      'PX',
      expect.any(Number),
    );
    expect((cache as any).l1.get('missing').expiresAt).toBeLessThanOrEqual(
      Date.now() + 50,
    );
  });

  it('invalidates L1 and L2 and broadcasts invalidation', async () => {
    const { cache, redis } = createCache();
    await cache.getOrLoad('dict:carrier', 1000, async () => ['YTO']);

    await cache.invalidate('dict:carrier');

    expect((cache as any).l1.has('dict:carrier')).toBe(false);
    expect(redis.del).toHaveBeenCalledWith('dict:carrier');
    expect(redis.publish).toHaveBeenCalledWith(
      'cache:invalidate',
      'dict:carrier',
    );
  });
});
