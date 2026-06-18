import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  it('rejects token bucket requests after capacity is exhausted and refills over time', async () => {
    let now = 0;
    const service = new RateLimitService();
    service.useClock(() => now);

    expect(
      (
        await service.check({
          key: 'pickup:tenant-1',
          strategy: 'token-bucket',
          limit: 2,
          windowMs: 1000,
        })
      ).allowed,
    ).toBe(true);
    expect(
      (
        await service.check({
          key: 'pickup:tenant-1',
          strategy: 'token-bucket',
          limit: 2,
          windowMs: 1000,
        })
      ).allowed,
    ).toBe(true);
    const denied = await service.check({
      key: 'pickup:tenant-1',
      strategy: 'token-bucket',
      limit: 2,
      windowMs: 1000,
    });
    expect(denied).toMatchObject({ allowed: false, retryAfter: 1 });

    now = 500;
    expect(
      (
        await service.check({
          key: 'pickup:tenant-1',
          strategy: 'token-bucket',
          limit: 2,
          windowMs: 1000,
        })
      ).allowed,
    ).toBe(true);
  });

  it('rejects sliding window requests over the configured threshold', async () => {
    let now = 10_000;
    const service = new RateLimitService();
    service.useClock(() => now);
    const input = {
      key: 'login:127.0.0.1:admin',
      strategy: 'sliding-window' as const,
      limit: 2,
      windowMs: 1000,
    };

    expect((await service.check(input)).allowed).toBe(true);
    expect((await service.check(input)).allowed).toBe(true);
    expect(await service.check(input)).toMatchObject({
      allowed: false,
      retryAfter: 1,
    });

    now = 11_001;
    expect((await service.check(input)).allowed).toBe(true);
  });

  it('shares sliding window counters through Redis across service instances', async () => {
    const redis = makeRedis();
    const first = new RateLimitService(redis as any);
    const second = new RateLimitService(redis as any);
    const input = {
      key: 'otp:send:127.0.0.1:13800000000',
      strategy: 'sliding-window' as const,
      limit: 1,
      windowMs: 60_000,
    };

    await expect(first.check(input)).resolves.toMatchObject({ allowed: true });
    await expect(second.check(input)).resolves.toMatchObject({
      allowed: false,
      retryAfter: expect.any(Number),
    });
  });
});

function makeRedis() {
  const windows = new Map<string, number[]>();
  return {
    getClient: () => ({
      eval: jest.fn(async (_script: string, _keys: number, key: string) => {
        const now = Date.now();
        const windowMs = 60_000;
        const hits = (windows.get(key) ?? []).filter(
          (hit) => hit > now - windowMs,
        );
        if (hits.length >= 1) {
          windows.set(key, hits);
          return [0, 60];
        }
        hits.push(now);
        windows.set(key, hits);
        return [1, 0];
      }),
    }),
  };
}
