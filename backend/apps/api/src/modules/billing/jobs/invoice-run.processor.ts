import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RedisLockService } from '../../../core/redis/redis-lock.service';
import { TenantContext } from '../../../core/tenant-context/tenant-context';
import { InvoiceService } from '../invoice/invoice.service';

const INVOICE_RUN_LOCK_KEY = 'lock:billing-invoice-run';
const INVOICE_RUN_LOCK_TTL_MS = 10 * 60 * 1000;
const INVOICE_RUN_BATCH_SIZE = 200;
const SYSTEM_OPERATOR_ID = '00000000-0000-0000-0000-000000000000';

export interface InvoiceRunResult {
  skipped: boolean;
  scanned: number;
  generated: number;
}

@Injectable()
export class InvoiceRunProcessor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locks: RedisLockService,
    private readonly invoices: InvoiceService,
  ) {}

  async runInvoiceRun(now = new Date()): Promise<InvoiceRunResult> {
    const lock = await this.locks.acquire(
      INVOICE_RUN_LOCK_KEY,
      INVOICE_RUN_LOCK_TTL_MS,
    );
    if (!lock.ok) {
      return { skipped: true, scanned: 0, generated: 0 };
    }

    try {
      const subscriptions = await this.withBypass<any[]>((tx) =>
        tx.subscription.findMany({
          where: {
            status: { in: ['ACTIVE', 'PAST_DUE'] },
            nextBillingAt: { lte: now },
            deletedAt: null,
          },
          select: { id: true, tenantId: true },
          orderBy: { nextBillingAt: 'asc' },
          take: INVOICE_RUN_BATCH_SIZE,
        }),
      );

      let generated = 0;
      for (const subscription of subscriptions) {
        await TenantContext.run(
          {
            userId: SYSTEM_OPERATOR_ID,
            tenantId: subscription.tenantId,
            roles: ['system'],
            isPlatform: false,
          },
          () =>
            this.invoices.generateInvoice({
              tenantId: subscription.tenantId,
              subscriptionId: subscription.id,
              now,
            }),
        );
        generated += 1;
      }

      return { skipped: false, scanned: subscriptions.length, generated };
    } finally {
      await lock.release();
    }
  }

  private async withBypass<T>(fn: (tx: any) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return fn(tx);
    });
  }
}
