import { MetricsService } from '../observability/metrics.service';
import { RedisLockService } from '../redis/redis-lock.service';
import { ScheduledLockService } from './scheduler-lock.service';

describe('ScheduledLockService', () => {
  it('runs only one concurrent job with the same name and records skips', async () => {
    const release = jest.fn().mockResolvedValue(true);
    const locks = {
      acquire: jest
        .fn()
        .mockResolvedValueOnce({ ok: true, release })
        .mockResolvedValueOnce({ ok: false, release: jest.fn() }),
    } as unknown as jest.Mocked<RedisLockService>;
    const metrics = new MetricsService();
    const service = new ScheduledLockService(locks, metrics);
    const entered: string[] = [];

    const [first, second] = await Promise.all([
      service.runExclusive(
        'billing.invoice-run',
        1000,
        async () => {
          entered.push('first');
          return { skipped: false, generated: 1 };
        },
        { skipped: true, generated: 0 },
      ),
      service.runExclusive(
        'billing.invoice-run',
        1000,
        async () => {
          entered.push('second');
          return { skipped: false, generated: 1 };
        },
        { skipped: true, generated: 0 },
      ),
    ]);

    expect(locks.acquire).toHaveBeenCalledWith(
      'lock:scheduler:billing.invoice-run',
      1000,
    );
    expect(entered).toEqual(['first']);
    expect(first).toEqual({ skipped: false, generated: 1 });
    expect(second).toEqual({ skipped: true, generated: 0 });
    expect(release).toHaveBeenCalledTimes(1);
    expect(metrics.render()).toContain(
      'scheduled_job_skipped_total{name="billing.invoice-run"} 1',
    );
  });
});
