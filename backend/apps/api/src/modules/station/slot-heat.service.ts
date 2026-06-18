import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { TenantContext } from '../../core/tenant-context/tenant-context';

interface RecordPickupInput {
  tenantId: string;
  stationId: string;
  slotId: string;
  storedAt?: Date | null;
  pickedUpAt: Date;
}

interface RecordPickedParcelInput {
  tenantId: string;
  parcelId: string;
}

@Injectable()
export class SlotHeatService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async recordPickup(input: RecordPickupInput) {
    const statDate = this.startOfDay(input.pickedUpAt);
    const hour = input.pickedUpAt.getUTCHours();
    const dwellMinutes = this.dwellMinutes(input.storedAt, input.pickedUpAt);

    return this.tenantPrisma.withTenant(async (tx) => {
      const existing = await tx.slotHeatDaily.findFirst({
        where: {
          tenantId: input.tenantId,
          stationId: input.stationId,
          slotId: input.slotId,
          statDate,
        },
      });
      if (!existing) {
        const histogram = Array(24).fill(0);
        histogram[hour] = 1;
        return tx.slotHeatDaily.create({
          data: {
            tenantId: input.tenantId,
            stationId: input.stationId,
            slotId: input.slotId,
            statDate,
            pickCount: 1,
            storeCount: 0,
            avgDwellMinutes: dwellMinutes,
            hourHistogram: histogram,
          },
        });
      }

      const pickCount = existing.pickCount + 1;
      const histogram = this.toHistogram(existing.hourHistogram);
      histogram[hour] = (histogram[hour] ?? 0) + 1;
      const avgDwellMinutes = Math.round(
        (existing.avgDwellMinutes * existing.pickCount + dwellMinutes) /
          pickCount,
      );

      return tx.slotHeatDaily.update({
        where: { id: existing.id },
        data: {
          pickCount,
          avgDwellMinutes,
          hourHistogram: histogram,
        },
      });
    });
  }

  async recordPickedParcel(input: RecordPickedParcelInput) {
    const run = async () =>
      this.tenantPrisma.withTenant(async (tx) => {
        const parcel = await tx.parcel.findFirst({
          where: {
            id: input.parcelId,
            tenantId: input.tenantId,
            slotId: { not: null },
          },
        });
        if (!parcel?.slotId || !parcel.pickedUpAt) {
          return null;
        }
        return this.recordPickup({
          tenantId: parcel.tenantId,
          stationId: parcel.stationId,
          slotId: parcel.slotId,
          storedAt: parcel.storedAt,
          pickedUpAt: parcel.pickedUpAt,
        });
      });
    const ctx = TenantContext.get();
    if (ctx?.tenantId === input.tenantId) {
      return run();
    }
    return TenantContext.run(
      {
        userId: 'slot-heat-subscriber',
        tenantId: input.tenantId,
        roles: [],
        isPlatform: false,
      },
      run,
    );
  }

  async heatmap(stationId: string, date: string) {
    const statDate = this.startOfDay(new Date(`${date}T00:00:00.000Z`));
    const rows = await this.tenantPrisma.withTenant<any[]>((tx) =>
      tx.slotHeatDaily.findMany({
        where: { stationId, statDate },
        include: { slot: true },
        orderBy: [{ pickCount: 'desc' }, { updatedAt: 'desc' }],
      }),
    );
    return rows.map((row: any) => ({
      slotId: row.slotId,
      slotCode: row.slot?.code,
      pickCount: row.pickCount,
      storeCount: row.storeCount,
      avgDwellMinutes: row.avgDwellMinutes,
      hourHistogram: this.toHistogram(row.hourHistogram),
    }));
  }

  private dwellMinutes(storedAt: Date | null | undefined, pickedUpAt: Date) {
    if (!storedAt) {
      return 0;
    }
    return Math.max(
      Math.round((pickedUpAt.getTime() - storedAt.getTime()) / 60000),
      0,
    );
  }

  private startOfDay(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private toHistogram(value: unknown): number[] {
    if (Array.isArray(value)) {
      return Array.from({ length: 24 }, (_, index) =>
        Number(value[index] ?? 0),
      );
    }
    return Array(24).fill(0);
  }
}
