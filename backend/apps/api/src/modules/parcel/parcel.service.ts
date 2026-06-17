import { Injectable } from '@nestjs/common';
import { EventBus } from '../../core/event-bus/event-bus';
import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { ParcelAggregate, ParcelStatus } from './parcel.aggregate';

interface CreateParcelInput {
  stationId: string;
  waybillNo: string;
  carrier?: string;
  receiverPhone: string;
}

interface StoreParcelInput {
  pickupCode: string;
  slotId: string;
}

@Injectable()
export class ParcelService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly eventBus: EventBus,
  ) {}

  async create(input: CreateParcelInput) {
    const ctx = this.requireContext();

    return this.tenantPrisma.withTenant(async (tx) => {
      const parcel = await tx.parcel.create({
        data: {
          tenantId: ctx.tenantId,
          stationId: input.stationId,
          waybillNo: input.waybillNo,
          carrier: input.carrier,
          receiverPhone: input.receiverPhone,
          receiverPhoneTail: this.phoneTail(input.receiverPhone),
          status: 'PENDING',
          createdBy: ctx.userId,
        },
      });
      await tx.parcelEvent.create({
        data: {
          tenantId: ctx.tenantId,
          parcelId: parcel.id,
          fromStatus: null,
          toStatus: 'PENDING',
          eventType: 'INBOUND',
          operatorId: ctx.userId,
          payload: {
            waybillNo: input.waybillNo,
            receiverPhoneTail: parcel.receiverPhoneTail,
          },
        },
      });
      return parcel;
    });
  }

  async markStored(parcelId: string, input: StoreParcelInput) {
    const ctx = this.requireContext();
    const event = await this.tenantPrisma.withTenant(async (tx) => {
      const before = await tx.parcel.findUniqueOrThrow({
        where: { id: parcelId },
      });
      ParcelAggregate.assertTransit(before.status as ParcelStatus, 'STORED');

      const parcel = await tx.parcel.update({
        where: { id: parcelId },
        data: {
          pickupCode: input.pickupCode,
          slotId: input.slotId,
          status: 'STORED',
          storedAt: new Date(),
          version: { increment: 1 },
        },
      });
      const slot = await tx.slot.findUnique({ where: { id: input.slotId } });
      await tx.parcelEvent.create({
        data: {
          tenantId: parcel.tenantId,
          parcelId: parcel.id,
          fromStatus: before.status,
          toStatus: 'STORED',
          eventType: 'STORED',
          operatorId: ctx.userId,
          payload: {
            pickupCode: input.pickupCode,
            slotId: input.slotId,
            slotCode: slot?.code,
          },
        },
      });

      return {
        parcel,
        event: EventBus.createEvent('ParcelStored', {
          parcelId: parcel.id,
          tenantId: parcel.tenantId,
          stationId: parcel.stationId,
          receiverPhone: parcel.receiverPhone,
          pickupCode: parcel.pickupCode,
          slotId: parcel.slotId,
          slotCode: slot?.code,
        }),
      };
    });

    await this.eventBus.publish(event.event);
    return event.parcel;
  }

  async markPickedUp(parcelId: string, expectedVersion: number) {
    const ctx = this.requireContext();
    const event = await this.tenantPrisma.withTenant(async (tx) => {
      const before = await tx.parcel.findUniqueOrThrow({
        where: { id: parcelId },
      });
      ParcelAggregate.assertTransit(before.status as ParcelStatus, 'PICKED_UP');

      const pickedUpAt = new Date();
      const result = await tx.parcel.updateMany({
        where: { id: parcelId, status: 'STORED', version: expectedVersion },
        data: {
          status: 'PICKED_UP',
          pickedUpAt,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new BizError(ApiCode.ALREADY_PICKED_UP, '包裹已被取走');
      }

      const parcel = await tx.parcel.findUnique({ where: { id: parcelId } });
      await tx.parcelEvent.create({
        data: {
          tenantId: before.tenantId,
          parcelId,
          fromStatus: before.status,
          toStatus: 'PICKED_UP',
          eventType: 'PICKED_UP',
          operatorId: ctx.userId,
          payload: { slotId: before.slotId, pickedUpAt },
        },
      });

      return {
        parcel,
        event: EventBus.createEvent('ParcelPickedUp', {
          parcelId,
          tenantId: before.tenantId,
          stationId: before.stationId,
          slotId: before.slotId,
        }),
      };
    });

    await this.eventBus.publish(event.event);
    return event.parcel;
  }

  private requireContext() {
    const ctx = TenantContext.get();
    if (!ctx?.tenantId) {
      throw new BizError(ApiCode.BAD_REQUEST, '缺少租户上下文');
    }
    return { ...ctx, tenantId: ctx.tenantId };
  }

  private phoneTail(phone: string) {
    return phone.slice(-4);
  }
}
