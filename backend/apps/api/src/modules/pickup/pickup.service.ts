import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { RedisLockService } from '../../core/redis/redis-lock.service';
import { PickupCodeService } from '../inbound/pickup-code.service';
import { ParcelService } from '../parcel/parcel.service';

interface PickupInput {
  stationId: string;
  pickupCode?: string;
  phoneTail?: string;
  parcelId?: string;
}

@Injectable()
export class PickupService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly locks: RedisLockService,
    private readonly parcels: ParcelService,
    private readonly pickupCodes: PickupCodeService,
  ) {}

  async pickup(input: PickupInput) {
    this.assertHasIdentifier(input);
    const parcel = await this.findStoredParcel(input);

    return this.locks.withLock(`lock:parcel:${parcel.id}`, 10000, async () => {
      const picked = await this.parcels.markPickedUp(parcel.id, parcel.version);
      if (parcel.pickupCode) {
        await this.pickupCodes.release(parcel.stationId, parcel.pickupCode);
      }
      return {
        parcelId: picked.id,
        status: 'PICKED_UP',
        slotReleased: true,
      };
    });
  }

  private assertHasIdentifier(input: PickupInput) {
    const pickupCode = input.pickupCode?.trim();
    const phoneTail = input.phoneTail?.trim();
    const parcelId = input.parcelId?.trim();
    if (!pickupCode && !phoneTail && !parcelId) {
      throw new BizError(
        ApiCode.BAD_REQUEST,
        '请提供取件码/手机尾号/包裹号至少一项',
      );
    }
  }

  private async findStoredParcel(input: PickupInput) {
    const rows: any[] = await this.tenantPrisma.withTenant((tx) =>
      tx.parcel.findMany({
        where: {
          stationId: input.stationId,
          status: 'STORED',
          deletedAt: null,
          ...(input.parcelId ? { id: input.parcelId } : {}),
          ...(input.pickupCode ? { pickupCode: input.pickupCode } : {}),
          ...(input.phoneTail ? { receiverPhoneTail: input.phoneTail } : {}),
        },
        orderBy: { storedAt: 'asc' },
      }),
    );

    if (rows.length === 0) {
      throw new BizError(ApiCode.PARCEL_NOT_FOUND, '未找到在库包裹');
    }
    if (rows.length > 1) {
      throw new BizError(
        ApiCode.AMBIGUOUS_PICKUP,
        '尾号匹配多个包裹，请使用取件码',
      );
    }
    return rows[0];
  }
}
