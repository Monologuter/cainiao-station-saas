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
    if (existing) return this.toResult(existing);

    const parcel = await this.parcels.create(input);
    const slot = await this.slots.allocate(input.stationId, parcel.id);
    const pickupCode = await this.pickupCodes.generate(input.stationId);
    const stored = await this.parcels.markStored(parcel.id, {
      pickupCode,
      slotId: slot.id,
    });

    return {
      parcelId: stored.id,
      pickupCode: stored.pickupCode,
      slotCode: slot.code,
      status: stored.status,
    };
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
      status: parcel.status,
    };
  }
}
