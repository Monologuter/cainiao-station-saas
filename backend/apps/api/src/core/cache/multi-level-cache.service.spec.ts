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

  it('reloads after the L1 TTL expires (no L2 backing)', async () => {
    // 无 Redis：只有 L1。TTL 过期后必须重新走 loader，而非返回过期值。
    const cache = new MultiLevelCacheService(undefined);
    const loader = jest
      .fn()
      .mockResolvedValueOnce('v1')
      .mockResolvedValueOnce('v2');
    const ttlMs = 1000;

    const nowSpy = jest.spyOn(Date, 'now');
    try {
      nowSpy.mockReturnValue(10_000);
      await expect(cache.getOrLoad('k', ttlMs, loader)).resolves.toBe('v1');

      // 仍在 TTL 内（+999ms）：命中 L1，不调用 loader。
      nowSpy.mockReturnValue(10_999);
      await expect(cache.getOrLoad('k', ttlMs, loader)).resolves.toBe('v1');
      expect(loader).toHaveBeenCalledTimes(1);

      // 越过 TTL（+1001ms）：L1 过期，重新加载得到新值。
      nowSpy.mockReturnValue(11_001);
      await expect(cache.getOrLoad('k', ttlMs, loader)).resolves.toBe('v2');
      expect(loader).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('expired L1 falls back to a still-valid L2 entry instead of the loader', async () => {
    // L1 过期但 L2 仍有值：应从 L2 水合，不触发 loader。
    const redis = new FakeRedis();
    const { cache } = createCache(redis);
    const loader = jest.fn().mockResolvedValue('fresh');
    const ttlMs = 1000;

    const nowSpy = jest.spyOn(Date, 'now');
    try {
      nowSpy.mockReturnValue(20_000);
      await expect(cache.getOrLoad('k2', ttlMs, loader)).resolves.toBe('fresh');
      expect(loader).toHaveBeenCalledTimes(1);
      expect(redis.store.has('k2')).toBe(true);

      // L1 过期后再读：L2 命中（FakeRedis 不淘汰），loader 不再被调用。
      nowSpy.mockReturnValue(21_001);
      await expect(cache.getOrLoad('k2', ttlMs, loader)).resolves.toBe('fresh');
      expect(loader).toHaveBeenCalledTimes(1);
      expect(redis.get).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
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
