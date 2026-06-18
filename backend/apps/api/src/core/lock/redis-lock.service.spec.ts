import { ApiCode, BizError } from '../http/api-code';
import { RedisLockService } from './redis-lock.service';

class InMemoryRedisClient {
  now = 0;
  readonly values = new Map<string, { token: string; expiresAt: number }>();

  async set(
    key: string,
    token: string,
    px: 'PX',
    ttlMs: number,
    nx: 'NX',
  ): Promise<'OK' | null> {
    expect(px).toBe('PX');
    expect(nx).toBe('NX');
    const current = this.values.get(key);
    if (current && current.expiresAt > this.now) return null;
    this.values.set(key, { token, expiresAt: this.now + ttlMs });
    return 'OK';
  }

  async eval(
    script: string,
    _keys: number,
    key: string,
    token: string,
    ttlMs?: number,
  ) {
    const current = this.values.get(key);
    if (!current || current.token !== token) return 0;
    if (script.includes('pexpire')) {
      current.expiresAt = this.now + Number(ttlMs);
      return 1;
    }
    this.values.delete(key);
    return 1;
  }

  advance(ms: number) {
    this.now += ms;
  }
}

function serviceWith(client: any) {
  return new RedisLockService({ getClient: () => client } as any);
}

describe('RedisLockService standardized primitive', () => {
  it('allows only one concurrent acquire for the same key', async () => {
    const client = new InMemoryRedisClient();
    const service = serviceWith(client);

    const [first, second] = await Promise.all([
      service.acquire('lock:test:parcel-1', 1000),
      service.acquire('lock:test:parcel-1', 1000),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  it('does not release a lock when the token no longer matches', async () => {
    const client = new InMemoryRedisClient();
    const lock = await serviceWith(client).acquire('lock:test:parcel-2', 1000);
    expect(lock.ok).toBe(true);

    client.values.set('lock:test:parcel-2', {
      token: 'foreign-token',
      expiresAt: 1000,
    });

    await expect(lock.release()).resolves.toBe(false);
    expect(client.values.get('lock:test:parcel-2')?.token).toBe(
      'foreign-token',
    );
  });

  it('allows reacquire after ttl expires', async () => {
    const client = new InMemoryRedisClient();
    const service = serviceWith(client);
    await expect(
      service.acquire('lock:test:parcel-3', 1000),
    ).resolves.toMatchObject({ ok: true });

    client.advance(1001);

    await expect(
      service.acquire('lock:test:parcel-3', 1000),
    ).resolves.toMatchObject({ ok: true });
  });

  it('fails closed with a business error when redis is unavailable', async () => {
    const client = {
      set: jest.fn().mockRejectedValue(new Error('redis down')),
    };

    await expect(
      serviceWith(client).runWithLock(
        'lock:test:strict',
        1000,
        async () => 'ok',
      ),
    ).rejects.toMatchObject<Partial<BizError>>({ code: ApiCode.LOCK_BUSY });
  });

  it('extends a held lock with the same token only', async () => {
    const client = new InMemoryRedisClient();
    const lock = await serviceWith(client).acquire('lock:test:parcel-4', 1000);

    expect(lock.extend).toBeDefined();
    await expect(lock.extend!(2000)).resolves.toBe(true);
    expect(client.values.get('lock:test:parcel-4')?.expiresAt).toBe(2000);
  });
});
