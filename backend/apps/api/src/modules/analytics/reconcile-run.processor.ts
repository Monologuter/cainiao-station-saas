import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ScheduledLockService } from '../../core/scheduler-lock/scheduler-lock.service';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { ReconcileService } from './reconcile.service';

const RECONCILE_JOB_NAME = 'analytics.reconcile';
const RECONCILE_LOCK_TTL_MS = 10 * 60 * 1000;
const RECONCILE_BATCH_SIZE = 500;
const SYSTEM_OPERATOR_ID = '00000000-0000-0000-0000-000000000000';

export interface ReconcileRunResult {
  skipped: boolean;
  stations: number;
  reconciled: number;
  failed: number;
  failures: Array<{ tenantId: string; stationId: string; message: string }>;
}

/**
 * FUNC-8b：每日支付/分析对账的定时任务。
 *
 * 此前 `ReconcileService.recomputeDay` 只有手动端点（POST /api/analytics/reconcile），
 * 无法自动跑全量。本 processor 仿 ForecastProcessor 的「repeatable + 分布式锁 + 逐门店」
 * 模式，调用既有对账逻辑，对所有门店重算「昨天」的指标，落库到 metric_daily。
 *
 * - 分布式锁（ScheduledLockService）：多实例下只有一个节点真正执行，其余跳过。
 * - 逐门店在 TenantContext 下调用既有 recomputeDay，复用 RLS 与现有对账实现。
 * - 单门店失败不影响其余门店，失败明细汇总返回，便于排障。
 */
@Injectable()
export class ReconcileRunProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerLocks: ScheduledLockService,
    private readonly reconcile: ReconcileService,
  ) {}

  async runDailyReconcile(now = new Date()): Promise<ReconcileRunResult> {
    return this.schedulerLocks.runExclusive(
      RECONCILE_JOB_NAME,
      RECONCILE_LOCK_TTL_MS,
      () => this.reconcileStations(now),
      this.emptyResult(true),
    );
  }

  private async reconcileStations(now: Date): Promise<ReconcileRunResult> {
    // 对账目标日为「昨天」：当天数据仍在产生，跑前一日才是完整账期。
    const targetDate = this.dateOnly(now);
    targetDate.setUTCDate(targetDate.getUTCDate() - 1);

    const stations = await this.withBypass<any[]>((tx) =>
      tx.station.findMany({
        where: { deletedAt: null },
        select: { id: true, tenantId: true },
        orderBy: { createdAt: 'asc' },
        take: RECONCILE_BATCH_SIZE,
      }),
    );

    let reconciled = 0;
    const failures: ReconcileRunResult['failures'] = [];
    for (const station of stations) {
      try {
        await TenantContext.run(
          {
            tenantId: station.tenantId,
            userId: SYSTEM_OPERATOR_ID,
            roles: ['system'],
            isPlatform: false,
          },
          () =>
            this.reconcile.recomputeDay({
              tenantId: station.tenantId,
              stationId: station.id,
              date: targetDate,
            }),
        );
        reconciled += 1;
      } catch (error) {
        failures.push({
          tenantId: station.tenantId,
          stationId: station.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      skipped: false,
      stations: stations.length,
      reconciled,
      failed: failures.length,
      failures,
    };
  }

  private async withBypass<T>(fn: (tx: any) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return fn(tx);
    });
  }

  private dateOnly(date: Date) {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private emptyResult(skipped: boolean): ReconcileRunResult {
    return { skipped, stations: 0, reconciled: 0, failed: 0, failures: [] };
  }
}
