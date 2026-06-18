import { ReconcileRunProcessor } from './reconcile-run.processor';

/**
 * FUNC-8b：每日对账定时任务。验证
 *  - 通过分布式锁 runExclusive 包裹（拿不到锁则跳过，返回 skipped）。
 *  - 逐门店调用既有 ReconcileService.recomputeDay，对账目标日为「昨天」。
 *  - 单门店失败被隔离，不影响其余门店，失败明细汇总返回。
 */
describe('ReconcileRunProcessor (FUNC-8b)', () => {
  function buildProcessor(options?: {
    lockAcquired?: boolean;
    stations?: Array<{ id: string; tenantId: string }>;
    recompute?: jest.Mock;
  }) {
    const stations = options?.stations ?? [
      { id: 's1', tenantId: 't1' },
      { id: 's2', tenantId: 't2' },
    ];
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
      station: { findMany: jest.fn().mockResolvedValue(stations) },
    };
    const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };

    const lockAcquired = options?.lockAcquired ?? true;
    const schedulerLocks = {
      runExclusive: jest.fn(async (_name, _ttl, fn, skipped) =>
        lockAcquired ? fn() : skipped,
      ),
    };
    const recompute =
      options?.recompute ?? jest.fn().mockResolvedValue({ inbound: 1 });
    const reconcile = { recomputeDay: recompute };

    const processor = new ReconcileRunProcessor(
      prisma as any,
      schedulerLocks as any,
      reconcile as any,
    );
    return { processor, schedulerLocks, recompute };
  }

  it('skips when the distributed lock is held by another instance', async () => {
    const { processor, recompute } = buildProcessor({ lockAcquired: false });

    const result = await processor.runDailyReconcile();

    expect(result).toMatchObject({ skipped: true, stations: 0, reconciled: 0 });
    expect(recompute).not.toHaveBeenCalled();
  });

  it('reconciles every station for yesterday and returns a summary', async () => {
    const { processor, schedulerLocks, recompute } = buildProcessor();
    const now = new Date('2026-06-18T08:00:00.000Z');

    const result = await processor.runDailyReconcile(now);

    // 用了分布式锁（锁名 + ttl）。
    expect(schedulerLocks.runExclusive).toHaveBeenCalledWith(
      'analytics.reconcile',
      expect.any(Number),
      expect.any(Function),
      expect.objectContaining({ skipped: true }),
    );
    expect(result).toMatchObject({
      skipped: false,
      stations: 2,
      reconciled: 2,
      failed: 0,
    });
    expect(recompute).toHaveBeenCalledTimes(2);
    // 对账目标日为「昨天」（2026-06-17，UTC 零点）。
    expect(recompute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        stationId: 's1',
        date: new Date('2026-06-17T00:00:00.000Z'),
      }),
    );
  });

  it('isolates a single station failure and reports it', async () => {
    const recompute = jest
      .fn()
      .mockResolvedValueOnce({ inbound: 1 })
      .mockRejectedValueOnce(new Error('boom'));
    const { processor } = buildProcessor({ recompute });

    const result = await processor.runDailyReconcile(
      new Date('2026-06-18T08:00:00.000Z'),
    );

    expect(result).toMatchObject({
      skipped: false,
      stations: 2,
      reconciled: 1,
      failed: 1,
    });
    expect(result.failures[0]).toMatchObject({
      stationId: 's2',
      message: 'boom',
    });
  });
});
