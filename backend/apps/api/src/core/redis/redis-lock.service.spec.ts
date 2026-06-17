import { ApiCode, BizError } from '../http/api-code';
import { RedisLockService } from './redis-lock.service';

function serviceWith(client: any) {
  return new RedisLockService({ getClient: () => client } as any);
}

describe('RedisLockService', () => {
  it('returns ok=false when lock key is already held', async () => {
    const client = { set: jest.fn().mockResolvedValue(null), eval: jest.fn() };
    const lock = await serviceWith(client).acquire('lock:slot:s1', 5000);

    expect(lock.ok).toBe(false);
    expect(client.set).toHaveBeenCalledWith(
      'lock:slot:s1',
      expect.any(String),
      'PX',
      5000,
      'NX',
    );
  });

  it('releases only the token it acquired', async () => {
    const client = { set: jest.fn().mockResolvedValue('OK'), eval: jest.fn() };
    const lock = await serviceWith(client).acquire('lock:parcel:p1', 10000);

    await lock.release();

    expect(client.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("get", KEYS[1])'),
      1,
      'lock:parcel:p1',
      expect.any(String),
    );
  });

  it('withLock throws LOCK_BUSY when lock is unavailable', async () => {
    const client = { set: jest.fn().mockResolvedValue(null), eval: jest.fn() };

    await expect(
      serviceWith(client).withLock('lock:parcel:p2', 10000, async () => 'ok'),
    ).rejects.toMatchObject<Partial<BizError>>({ code: ApiCode.LOCK_BUSY });
  });

  it('withLock releases after successful callback', async () => {
    const client = { set: jest.fn().mockResolvedValue('OK'), eval: jest.fn() };

    await expect(
      serviceWith(client).withLock('lock:parcel:p3', 10000, async () => 'ok'),
    ).resolves.toBe('ok');
    expect(client.eval).toHaveBeenCalledTimes(1);
  });
});
