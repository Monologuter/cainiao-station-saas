import { Injectable } from '@nestjs/common';
import { EventBus } from '../../../core/event-bus/event-bus';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { ScheduledLockService } from '../../../core/scheduler-lock/scheduler-lock.service';
import { TenantContext } from '../../../core/tenant-context/tenant-context';
import { ParcelService } from '../parcel.service';
import { classifyOverdue } from './overdue-policy';

const OVERDUE_SCAN_JOB_NAME = 'parcel.overdue-scan';
const OVERDUE_SCAN_LOCK_TTL_MS = 10 * 60 * 1000;
const OVERDUE_SCAN_BATCH_SIZE = 1000;
const SYSTEM_OPERATOR_ID = '00000000-0000-0000-0000-000000000000';

interface StoredParcelForScan {
  id: string;
  tenantId: string;
  stationId: string;
  storedAt: Date | null;
  lastOverdueLevel: number;
  receiverPhone: string;
  pickupCode?: string | null;
  slot?: { code: string } | null;
  station?: { name: string } | null;
}

export interface OverdueScanResult {
  skipped: boolean;
  scanned: number;
  upgraded: number;
  returned: number;
  levels: Record<1 | 2 | 3, number>;
}

@Injectable()
export class OverdueScanProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerLocks: ScheduledLockService,
    private readonly eventBus: EventBus,
    private readonly parcels: ParcelService,
  ) {}

  async runOverdueScan(now = new Date()): Promise<OverdueScanResult> {
    return this.schedulerLocks.runExclusive(
      OVERDUE_SCAN_JOB_NAME,
      OVERDUE_SCAN_LOCK_TTL_MS,
      () => this.scanStoredParcels(now),
      this.emptyResult(true),
    );
  }

  private async scanStoredParcels(now: Date): Promise<OverdueScanResult> {
    const result = this.emptyResult(false);
    const parcels = await this.withBypass((tx) =>
      tx.parcel.findMany({
        where: {
          status: 'STORED',
          storedAt: { not: null },
        },
        select: {
          id: true,
          tenantId: true,
          stationId: true,
          storedAt: true,
          lastOverdueLevel: true,
          receiverPhone: true,
          pickupCode: true,
          slot: { select: { code: true } },
          station: { select: { name: true } },
        },
        orderBy: { storedAt: 'asc' },
        take: OVERDUE_SCAN_BATCH_SIZE,
      }),
    );

    for (const parcel of parcels as StoredParcelForScan[]) {
      result.scanned += 1;
      if (!parcel.storedAt) {
        continue;
      }

      const overdue = classifyOverdue(parcel.storedAt, now);
      if (overdue.kind === 'RETURN') {
        await this.returnOverdueParcel(parcel);
        result.returned += 1;
        continue;
      }

      if (overdue.level === 0 || overdue.level <= parcel.lastOverdueLevel) {
        continue;
      }

      const upgraded = await this.upgradeOverdueLevel(parcel, overdue.level);
      if (!upgraded) {
        continue;
      }

      result.upgraded += 1;
      result.levels[overdue.level] += 1;
      await this.eventBus.publish(
        EventBus.createEvent('ParcelOverdueDetected', {
          tenantId: parcel.tenantId,
          parcelId: parcel.id,
          stationId: parcel.stationId,
          level: overdue.level,
          storedAt: parcel.storedAt,
          daysOverdue: this.daysBetween(parcel.storedAt, now),
          receiverPhone: parcel.receiverPhone,
          pickupCode: parcel.pickupCode,
          slotCode: parcel.slot?.code,
          stationName: parcel.station?.name,
        }),
      );
    }

    return result;
  }

  private async upgradeOverdueLevel(
    parcel: StoredParcelForScan,
    level: 1 | 2 | 3,
  ) {
    const updated: { count: number } = await this.withBypass((tx) =>
      tx.parcel.updateMany({
        where: {
          id: parcel.id,
          status: 'STORED',
          lastOverdueLevel: { lt: level },
        },
        data: { lastOverdueLevel: level },
      }),
    );
    return updated.count === 1;
  }

  private async returnOverdueParcel(parcel: StoredParcelForScan) {
    await TenantContext.run(
      {
        tenantId: parcel.tenantId,
        userId: SYSTEM_OPERATOR_ID,
        roles: ['system'],
        isPlatform: false,
      },
      () =>
        this.parcels.returnParcel(parcel.id, {
          cause: 'OVERDUE',
          reason: '滞留自动退回',
        }),
    );
  }

  private async withBypass<T>(fn: (tx: any) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return fn(tx);
    });
  }

  private daysBetween(start: Date, end: Date) {
    return Math.floor(
      (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
    );
  }

  private emptyResult(skipped: boolean): OverdueScanResult {
    return {
      skipped,
      scanned: 0,
      upgraded: 0,
      returned: 0,
      levels: { 1: 0, 2: 0, 3: 0 },
    };
  }
}
