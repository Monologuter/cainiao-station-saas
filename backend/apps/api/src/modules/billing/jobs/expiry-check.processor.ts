import { Injectable } from '@nestjs/common';
import { EventBus } from '../../../core/event-bus/event-bus';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisLockService } from '../../../core/redis/redis-lock.service';

const EXPIRY_CHECK_LOCK_KEY = 'lock:billing-expiry-check';
const EXPIRY_CHECK_LOCK_TTL_MS = 10 * 60 * 1000;
const EXPIRY_CHECK_BATCH_SIZE = 500;
const SUSPEND_GRACE_DAYS = 7;

export interface ExpiryCheckResult {
  skipped: boolean;
  overdue: number;
  suspended: number;
}

@Injectable()
export class ExpiryCheckProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locks: RedisLockService,
    private readonly eventBus: EventBus,
  ) {}

  async runExpiryCheck(now = new Date()): Promise<ExpiryCheckResult> {
    const lock = await this.locks.acquire(
      EXPIRY_CHECK_LOCK_KEY,
      EXPIRY_CHECK_LOCK_TTL_MS,
    );
    if (!lock.ok) {
      return { skipped: true, overdue: 0, suspended: 0 };
    }

    const events: Array<ReturnType<typeof EventBus.createEvent>> = [];
    try {
      const result = await this.withBypass<ExpiryCheckResult>(async (tx) => {
        const dueInvoices = await tx.invoice.findMany({
          where: {
            status: 'OPEN',
            dueAt: { lt: now },
            deletedAt: null,
          },
          select: { id: true, tenantId: true, subscriptionId: true },
          orderBy: { dueAt: 'asc' },
          take: EXPIRY_CHECK_BATCH_SIZE,
        });

        for (const invoice of dueInvoices) {
          await tx.invoice.updateMany({
            where: { id: invoice.id, status: 'OPEN' },
            data: { status: 'OVERDUE' },
          });
          await tx.subscription.updateMany({
            where: { id: invoice.subscriptionId, status: 'ACTIVE' },
            data: { status: 'PAST_DUE' },
          });
        }

        const suspendCutoff = this.addDays(now, -SUSPEND_GRACE_DAYS);
        const overdueInvoices = await tx.invoice.findMany({
          where: {
            status: 'OVERDUE',
            dueAt: { lt: suspendCutoff },
            deletedAt: null,
          },
          select: {
            id: true,
            tenantId: true,
            subscriptionId: true,
            tenant: { select: { status: true } },
          },
          orderBy: { dueAt: 'asc' },
          take: EXPIRY_CHECK_BATCH_SIZE,
        });

        let suspended = 0;
        const suspendedTenants = new Set<string>();
        for (const invoice of overdueInvoices) {
          await tx.subscription.updateMany({
            where: {
              id: invoice.subscriptionId,
              status: { in: ['ACTIVE', 'PAST_DUE'] },
            },
            data: { status: 'SUSPENDED' },
          });
          const tenantUpdate = await tx.tenant.updateMany({
            where: { id: invoice.tenantId, status: 'ACTIVE' },
            data: { status: 'SUSPENDED' },
          });
          if (
            tenantUpdate.count === 1 &&
            !suspendedTenants.has(invoice.tenantId)
          ) {
            suspendedTenants.add(invoice.tenantId);
            suspended += 1;
            events.push(
              EventBus.createEvent('TenantStatusChanged', {
                tenantId: invoice.tenantId,
                status: 'SUSPENDED',
                reason: 'OVERDUE',
              }),
            );
          }
        }

        return {
          skipped: false,
          overdue: dueInvoices.length,
          suspended,
        };
      });

      for (const event of events) {
        await this.eventBus.publish(event);
      }
      return result;
    } finally {
      await lock.release();
    }
  }

  async restoreTenantIfCleared(tenantId: string) {
    const event = await this.withBypass<ReturnType<
      typeof EventBus.createEvent
    > | null>(async (tx) => {
      const remaining = await tx.invoice.count({
        where: {
          tenantId,
          status: { in: ['OPEN', 'OVERDUE'] },
          deletedAt: null,
        },
      });
      if (remaining > 0) {
        return null;
      }

      const tenantUpdate = await tx.tenant.updateMany({
        where: { id: tenantId, status: 'SUSPENDED' },
        data: { status: 'ACTIVE' },
      });
      if (tenantUpdate.count !== 1) {
        return null;
      }
      await tx.subscription.updateMany({
        where: { tenantId, status: 'SUSPENDED' },
        data: { status: 'ACTIVE' },
      });
      return EventBus.createEvent('TenantStatusChanged', {
        tenantId,
        status: 'ACTIVE',
        reason: 'OVERDUE_CLEARED',
      });
    });

    if (!event) {
      return { restored: false };
    }
    await this.eventBus.publish(event);
    return { restored: true };
  }

  private async withBypass<T>(fn: (tx: any) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return fn(tx);
    });
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }
}
