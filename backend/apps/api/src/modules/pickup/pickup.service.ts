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
  authorizedPhone?: string;
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
    await this.assertPhoneTailFactor(parcel, input);
    await this.assertPickupAuthorized(parcel, input.authorizedPhone);

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
    // SEC-11 双因子防冒领：核销必须同时提供取件码 + 手机尾号。
    // parcelId 仅用于定位（缩小匹配范围），绝不作为单独的核销凭证。
    const pickupCode = input.pickupCode?.trim();
    const phoneTail = input.phoneTail?.trim();
    if (!pickupCode) {
      throw new BizError(ApiCode.BAD_REQUEST, '核销必须提供取件码');
    }
    if (!phoneTail) {
      throw new BizError(ApiCode.BAD_REQUEST, '核销必须提供手机尾号');
    }
  }

  private async findStoredParcel(input: PickupInput) {
    // 取件码是必填核销凭证，作为主定位条件；parcelId 可选，仅进一步缩小范围。
    // phoneTail 不参与定位——它是第二因子，在 assertPhoneTailFactor 中独立校验，
    // 避免尾号不符时退化为 PARCEL_NOT_FOUND 而掩盖真实的“尾号不符”错误。
    const pickupCode = input.pickupCode?.trim();
    const parcelId = input.parcelId?.trim();
    const rows: any[] = await this.tenantPrisma.withTenant((tx) =>
      tx.parcel.findMany({
        where: {
          stationId: input.stationId,
          status: 'STORED',
          deletedAt: null,
          pickupCode,
          ...(parcelId ? { id: parcelId } : {}),
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
        '取件码匹配多个包裹，请提供包裹号',
      );
    }
    return rows[0];
  }

  /**
   * SEC-11 第二因子：校验提供的手机尾号。
   * - 与该包裹收件人手机尾号一致 → 通过（本人取件）。
   * - 不一致时，若存在与该尾号匹配的有效代取授权 → 通过（被授权人取件）。
   * - 否则拒绝核销，给出“尾号不符”的明确错误。
   */
  private async assertPhoneTailFactor(parcel: any, input: PickupInput) {
    const phoneTail = input.phoneTail?.trim();
    if (!phoneTail) {
      throw new BizError(ApiCode.BAD_REQUEST, '核销必须提供手机尾号');
    }
    if (phoneTail === parcel.receiverPhoneTail) {
      return;
    }
    if (await this.matchesActiveAuthorization(parcel, phoneTail)) {
      return;
    }
    throw new BizError(ApiCode.FORBIDDEN, '手机尾号与收件人不符');
  }

  private async matchesActiveAuthorization(parcel: any, phoneTail: string) {
    const authorizations: any[] = await this.tenantPrisma.withTenant((tx) =>
      tx.pickupAuthorization.findMany({
        where: {
          tenantId: parcel.tenantId,
          ownerPhone: parcel.receiverPhone,
          status: 'ACTIVE',
          deletedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
    );
    return authorizations.some((auth: any) =>
      String(auth.authorizedPhone ?? '').endsWith(phoneTail),
    );
  }

  private async assertPickupAuthorized(parcel: any, authorizedPhone?: string) {
    const phone = authorizedPhone?.trim();
    if (!phone || phone === parcel.receiverPhone) {
      return;
    }
    const authorization = await this.tenantPrisma.withTenant((tx) =>
      tx.pickupAuthorization.findFirst({
        where: {
          tenantId: parcel.tenantId,
          ownerPhone: parcel.receiverPhone,
          authorizedPhone: phone,
          status: 'ACTIVE',
          deletedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
    );
    if (!authorization) {
      throw new BizError(ApiCode.FORBIDDEN, '未获得代取授权');
    }
  }
}
