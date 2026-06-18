import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  it('rejects token bucket requests after capacity is exhausted and refills over time', () => {
    let now = 0;
    const service = new RateLimitService();
    service.useClock(() => now);

    expect(
      service.check({
        key: 'pickup:tenant-1',
        strategy: 'token-bucket',
        limit: 2,
        windowMs: 1000,
      }).allowed,
    ).toBe(true);
    expect(
      service.check({
        key: 'pickup:tenant-1',
        strategy: 'token-bucket',
        limit: 2,
        windowMs: 1000,
      }).allowed,
    ).toBe(true);
    const denied = service.check({
      key: 'pickup:tenant-1',
      strategy: 'token-bucket',
      limit: 2,
      windowMs: 1000,
    });
    expect(denied).toMatchObject({ allowed: false, retryAfter: 1 });

    now = 500;
    expect(
      service.check({
        key: 'pickup:tenant-1',
        strategy: 'token-bucket',
        limit: 2,
        windowMs: 1000,
      }).allowed,
    ).toBe(true);
  });

  it('rejects sliding window requests over the configured threshold', () => {
    let now = 10_000;
    const service = new RateLimitService();
    service.useClock(() => now);
    const input = {
      key: 'login:127.0.0.1:admin',
      strategy: 'sliding-window' as const,
      limit: 2,
      windowMs: 1000,
    };

    expect(service.check(input).allowed).toBe(true);
    expect(service.check(input).allowed).toBe(true);
    expect(service.check(input)).toMatchObject({
      allowed: false,
      retryAfter: 1,
    });

    now = 11_001;
    expect(service.check(input).allowed).toBe(true);
  });
});
