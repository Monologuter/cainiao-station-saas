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

interface ListParcelInput {
  status?: string;
  phoneTail?: string;
  pickupCode?: string;
  slot?: string;
  page?: string;
  size?: string;
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

  async list(input: ListParcelInput) {
    const page = this.parsePositiveInt(input.page, 1);
    const size = Math.min(this.parsePositiveInt(input.size, 20), 100);
    const where = this.toListWhere(input);

    return this.tenantPrisma.withTenant(async (tx) => {
      const [total, list] = await Promise.all([
        tx.parcel.count({ where }),
        tx.parcel.findMany({
          where,
          include: {
            station: true,
            slot: true,
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * size,
          take: size,
        }),
      ]);

      return {
        list: list.map((parcel: any) => this.toParcelDto(parcel)),
        total,
        page,
        size,
      };
    });
  }

  async detail(id: string) {
    return this.tenantPrisma.withTenant(async (tx) => {
      const parcel = await tx.parcel.findUnique({
        where: { id },
        include: {
          station: true,
          slot: true,
          events: { orderBy: { createdAt: 'asc' } },
        },
      });
      if (!parcel) {
        throw new BizError(ApiCode.NOT_FOUND, '包裹不存在');
      }
      return this.toParcelDto(parcel);
    });
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

  private toListWhere(input: ListParcelInput) {
    const where: any = {};
    if (input.status) {
      where.status = this.parseStatus(input.status);
    }
    if (input.phoneTail) {
      where.receiverPhoneTail = input.phoneTail;
    }
    if (input.pickupCode) {
      where.pickupCode = input.pickupCode;
    }
    if (input.slot) {
      where.slot = { is: { code: input.slot } };
    }
    return where;
  }

  private parseStatus(status: string): ParcelStatus {
    if (
      status === 'PENDING' ||
      status === 'STORED' ||
      status === 'PICKED_UP' ||
      status === 'EXCEPTION' ||
      status === 'RETURNED'
    ) {
      return status;
    }
    throw new BizError(ApiCode.BAD_REQUEST, '包裹状态不支持');
  }

  private parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private toParcelDto(parcel: any) {
    return {
      id: parcel.id,
      tenantId: parcel.tenantId,
      stationId: parcel.stationId,
      waybillNo: parcel.waybillNo,
      carrier: parcel.carrier,
      receiverPhoneTail: parcel.receiverPhoneTail,
      pickupCode: parcel.pickupCode,
      status: parcel.status,
      storedAt: parcel.storedAt,
      pickedUpAt: parcel.pickedUpAt,
      createdAt: parcel.createdAt,
      updatedAt: parcel.updatedAt,
      station: parcel.station
        ? {
            id: parcel.station.id,
            name: parcel.station.name,
            code: parcel.station.code,
          }
        : null,
      slot: parcel.slot
        ? {
            id: parcel.slot.id,
            code: parcel.slot.code,
          }
        : null,
      events: parcel.events?.map((event: any) => ({
        id: event.id,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        eventType: event.eventType,
        operatorId: event.operatorId,
        payload: event.payload,
        createdAt: event.createdAt,
      })),
    };
  }
}
