import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { RedisLockService } from '../../core/redis/redis-lock.service';

@Injectable()
export class SlotAllocatorService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly locks: RedisLockService,
  ) {}

  async allocate(stationId: string, parcelId: string) {
    return this.tenantPrisma.withTenant(async (tx) => {
      const candidates = await this.findNextCandidates(tx, stationId);
      if (candidates.length === 0) {
        throw new BizError(ApiCode.NO_FREE_SLOT, '库位已满');
      }

      for (const candidate of candidates) {
        const allocated = await this.locks.withLock(
          `lock:slot:${candidate.id}`,
          5000,
          async () => {
            const result = await tx.slot.updateMany({
              where: {
                id: candidate.id,
                status: 'FREE',
                version: candidate.version,
              },
              data: {
                status: 'OCCUPIED',
                currentParcelId: parcelId,
                version: { increment: 1 },
              },
            });
            if (result.count !== 1) return null;
            return tx.slot.findUniqueOrThrow({ where: { id: candidate.id } });
          },
        );
        if (allocated) return allocated;
      }

      throw new BizError(ApiCode.NO_FREE_SLOT, '库位已满');
    });
  }

  async release(slotId: string, parcelId?: string): Promise<void> {
    await this.tenantPrisma.withTenant(async (tx) => {
      const slot = await tx.slot.findUnique({ where: { id: slotId } });
      if (!slot || slot.status === 'FREE') return;
      if (parcelId && slot.currentParcelId !== parcelId) return;

      await tx.slot.update({
        where: { id: slotId },
        data: {
          status: 'FREE',
          currentParcelId: null,
          version: { increment: 1 },
        },
      });
    });
  }

  private findNextCandidates(tx: any, stationId: string) {
    return tx.slot.findMany({
      where: {
        stationId,
        status: 'FREE',
        deletedAt: null,
        shelf: { status: 'ACTIVE', deletedAt: null },
      },
      take: 5,
      orderBy: [
        { rowNo: 'asc' },
        { levelNo: 'asc' },
        { colNo: 'asc' },
        { code: 'asc' },
      ],
    });
  }
}
