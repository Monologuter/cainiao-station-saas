import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { ParcelService } from '../parcel/parcel.service';
import { SlotAllocatorService } from '../station/slot-allocator.service';
import { PickupCodeService } from './pickup-code.service';

interface InboundInput {
  stationId: string;
  waybillNo: string;
  carrier?: string;
  receiverPhone: string;
}

@Injectable()
export class InboundService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly parcels: ParcelService,
    private readonly slots: SlotAllocatorService,
    private readonly pickupCodes: PickupCodeService,
  ) {}

  async inbound(input: InboundInput) {
    const existing = await this.findExisting(input.stationId, input.waybillNo);
    if (existing)
      return this.toResult(await this.waitIfPending(input, existing));

    const parcelResult = await this.createParcelOrReturnExisting(input);
    if (!parcelResult.created) {
      return this.toResult(parcelResult.parcel);
    }
    const parcel = parcelResult.parcel;

    let slot: Awaited<ReturnType<SlotAllocatorService['allocate']>> | null =
      null;
    // The pickup code currently reserved for this parcel. markStored may ask
    // for a fresh one on conflict; we release the superseded code immediately
    // so only the live code (if any) needs cleanup on failure.
    let reservedCode: string | null = null;

    try {
      slot = await this.slots.allocate(input.stationId, parcel.id);

      const stored = await this.parcels.markStored(parcel.id, {
        slotId: slot.id,
        reservePickupCode: async () => {
          if (reservedCode) {
            await this.safeRelease(() =>
              this.pickupCodes.release(input.stationId, reservedCode as string),
            );
          }
          reservedCode = await this.pickupCodes.generate(input.stationId);
          return reservedCode;
        },
      });

      return {
        parcelId: stored.id,
        pickupCode: stored.pickupCode,
        slotCode: slot.code,
        slotSource: slot.source,
        slotReasons: slot.reasons ?? [],
        status: stored.status,
      };
    } catch (error) {
      // Compensate so a failed inbound leaves no leaked resources: the slot
      // must not stay OCCUPIED and the reserved pickup code must be freed
      // within its TTL so it can be reused.
      if (slot) {
        const slotId = slot.id;
        await this.safeRelease(() => this.slots.release(slotId, parcel.id));
      }
      if (reservedCode) {
        const code = reservedCode;
        await this.safeRelease(() =>
          this.pickupCodes.release(input.stationId, code),
        );
      }
      // Soft-delete the still-PENDING parcel so it does not linger as a zombie
      // that blocks re-inbound of the same waybill (findExisting treats PENDING
      // as a duplicate).
      await this.safeRelease(() => this.abandonPendingParcel(parcel.id));
      throw error;
    }
  }

  private async createParcelOrReturnExisting(input: InboundInput) {
    try {
      return { created: true, parcel: await this.parcels.create(input) };
    } catch (error) {
      if (!this.isActiveWaybillConflict(error)) {
        throw error;
      }
      const existing = await this.waitForExisting(input);
      if (existing) {
        return { created: false, parcel: existing };
      }
      throw error;
    }
  }

  private async waitIfPending(input: InboundInput, existing: any) {
    if (existing.status !== 'PENDING') {
      return existing;
    }
    return (await this.waitForExisting(input)) ?? existing;
  }

  private async waitForExisting(input: InboundInput) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const existing: any = await this.findExisting(
        input.stationId,
        input.waybillNo,
      );
      if (existing && existing.status !== 'PENDING') {
        return existing;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return this.findExisting(input.stationId, input.waybillNo);
  }

  private isActiveWaybillConflict(error: unknown) {
    return (error as { code?: string } | null)?.code === 'P2002';
  }

  private async abandonPendingParcel(parcelId: string) {
    await this.tenantPrisma.withTenant(async (tx) => {
      await tx.parcel.updateMany({
        where: { id: parcelId, status: 'PENDING', deletedAt: null },
        data: { deletedAt: new Date() },
      });
    });
  }

  private async safeRelease(release: () => Promise<void>) {
    try {
      await release();
    } catch {
      // Best-effort cleanup: swallow compensation errors so the original
      // failure is the one that propagates to the caller.
    }
  }

  private async findExisting(stationId: string, waybillNo: string) {
    return this.tenantPrisma.withTenant((tx) =>
      tx.parcel.findFirst({
        where: {
          stationId,
          waybillNo,
          status: { in: ['PENDING', 'STORED'] },
          deletedAt: null,
        },
        include: { slot: true },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  private toResult(parcel: any) {
    return {
      parcelId: parcel.id,
      pickupCode: parcel.pickupCode,
      slotCode: parcel.slot?.code ?? null,
      slotSource: 'RULE_FALLBACK',
      slotReasons: [],
      status: parcel.status,
    };
  }
}
