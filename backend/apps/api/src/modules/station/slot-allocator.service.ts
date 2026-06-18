import { Injectable, Optional } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { RedisLockService } from '../../core/redis/redis-lock.service';
import {
  SlotRecommendation,
  SlotRecommenderClient,
} from './slot-recommender.client';

type OrderedSlotCandidate = {
  candidate: any;
  source: 'AI' | 'RULE_FALLBACK';
  recommendation?: SlotRecommendation;
};

@Injectable()
export class SlotAllocatorService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly locks: RedisLockService,
    @Optional() private readonly recommender?: SlotRecommenderClient,
  ) {}

  async allocate(stationId: string, parcelId: string) {
    return this.tenantPrisma.withTenant(async (tx) => {
      const candidates = await this.findNextCandidates(tx, stationId);
      if (candidates.length === 0) {
        throw new BizError(ApiCode.NO_FREE_SLOT, '库位已满');
      }

      const ordered = await this.orderCandidates(
        tx,
        stationId,
        parcelId,
        candidates,
      );
      for (const item of ordered) {
        const candidate = item.candidate;
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
        if (allocated) {
          return {
            ...allocated,
            source: item.source,
            score: item.recommendation?.score,
            reasons: item.recommendation?.reasons,
          };
        }
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
      take: 20,
      orderBy: [
        { rowNo: 'asc' },
        { levelNo: 'asc' },
        { colNo: 'asc' },
        { code: 'asc' },
      ],
    });
  }

  private async orderCandidates(
    tx: any,
    stationId: string,
    parcelId: string,
    candidates: any[],
  ) {
    const recommendations = await this.recommend(
      tx,
      stationId,
      parcelId,
      candidates,
    );
    if (!recommendations?.length) {
      return candidates.map<OrderedSlotCandidate>((candidate) => ({
        candidate,
        source: 'RULE_FALLBACK' as const,
      }));
    }

    const byId = new Map(
      candidates.map((candidate) => [candidate.id, candidate]),
    );
    const ordered: OrderedSlotCandidate[] = recommendations
      .map((recommendation) => ({
        candidate: byId.get(recommendation.slotId),
        recommendation,
        source: 'AI' as const,
      }))
      .filter((item) => item.candidate);
    const recommendedIds = new Set(ordered.map((item) => item.candidate.id));
    for (const candidate of candidates) {
      if (!recommendedIds.has(candidate.id)) {
        ordered.push({
          candidate,
          source: 'RULE_FALLBACK' as const,
          recommendation: undefined,
        });
      }
    }
    return ordered;
  }

  private async recommend(
    tx: any,
    stationId: string,
    parcelId: string,
    candidates: any[],
  ): Promise<SlotRecommendation[] | null> {
    if (!this.recommender) {
      return null;
    }
    const parcel = await tx.parcel.findUnique({ where: { id: parcelId } });
    const heatBySlot = await this.loadRecentHeat(tx, stationId, candidates);
    try {
      return await this.recommender.recommend({
        stationId,
        parcel: {
          phoneTail: parcel?.receiverPhoneTail ?? '0000',
          sizeClass: 'M',
          inboundHour: (parcel?.createdAt ?? new Date()).getHours(),
        },
        candidates: candidates.map((slot, index) => ({
          slotId: slot.id,
          slotCode: slot.code,
          sizeCapacity: this.sizeCapacity(slot),
          distanceRank: index + 1,
          heat: heatBySlot.get(slot.id) ?? this.emptyHeat(),
        })),
      });
    } catch {
      return null;
    }
  }

  private async loadRecentHeat(tx: any, stationId: string, candidates: any[]) {
    if (candidates.length === 0 || !tx.slotHeatDaily?.findMany) {
      return new Map<
        string,
        { pickCount7d: number; hourHistogram: number[] }
      >();
    }
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 7);
    const rows = await tx.slotHeatDaily.findMany({
      where: {
        stationId,
        slotId: { in: candidates.map((slot) => slot.id) },
        statDate: { gte: since },
      },
    });
    const bySlot = new Map<
      string,
      { pickCount7d: number; hourHistogram: number[] }
    >();
    for (const row of rows) {
      const heat = bySlot.get(row.slotId) ?? this.emptyHeat();
      heat.pickCount7d += Number(row.pickCount ?? 0);
      const histogram = this.toHistogram(row.hourHistogram);
      for (let hour = 0; hour < 24; hour += 1) {
        heat.hourHistogram[hour] += histogram[hour];
      }
      bySlot.set(row.slotId, heat);
    }
    return bySlot;
  }

  private emptyHeat() {
    return { pickCount7d: 0, hourHistogram: Array(24).fill(0) };
  }

  private toHistogram(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return Array(24).fill(0);
    }
    return Array.from({ length: 24 }, (_, index) => Number(value[index] ?? 0));
  }

  private sizeCapacity(slot: any): 'S' | 'M' | 'L' {
    const code = String(slot.code ?? '').toUpperCase();
    if (code.includes('L')) return 'L';
    if (code.includes('S')) return 'S';
    return 'M';
  }
}
