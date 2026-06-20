import { Injectable } from '@nestjs/common';
import { EventBus } from '../../core/event-bus/event-bus';
import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { resolveStationFilter } from '../../core/tenant-context/station-scope';
import { ParcelAggregate, ParcelStatus } from './parcel.aggregate';

export type ParcelSizeInput = 'S' | 'M' | 'L';

interface CreateParcelInput {
  stationId: string;
  waybillNo: string;
  carrier?: string;
  receiverPhone: string;
  // FUNC-1: 包裹尺寸，入库可显式指定；缺省落到默认 M。
  size?: ParcelSizeInput;
}

interface StoreParcelInput {
  slotId: string;
  // Reserves a fresh pickup code. Invoked once per attempt so markStored can
  // regenerate the code when it collides with the active-code unique index.
  reservePickupCode: () => Promise<string>;
}

const MARK_STORED_MAX_ATTEMPTS = 5;

type ExceptionParcelType =
  | 'DAMAGED'
  | 'MISDELIVERED'
  | 'UNCLAIMED'
  | 'REJECTED'
  | 'OVERSIZED';

interface MarkExceptionInput {
  type: ExceptionParcelType;
  description: string;
  exceptionId?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH';
  evidenceUrls?: string[];
}

interface RestockInput {
  reason?: string;
}

export type ReturnCause = 'OVERDUE' | 'EXCEPTION_RETURN';

interface ReturnParcelInput {
  cause: ReturnCause;
  reason?: string;
}

interface ListParcelInput {
  status?: string;
  phoneTail?: string;
  pickupCode?: string;
  waybillNo?: string;
  slot?: string;
  page?: string;
  size?: string;
}

interface ListOverdueInput {
  level?: string;
  page?: string;
  size?: string;
}

interface ListAssistantParcelsInput {
  tenantId: string;
  receiverPhone: string;
  status?: string;
  limit?: number;
}

interface AssistantOwnedParcelInput {
  tenantId: string;
  parcelId: string;
  receiverPhone: string;
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
          // FUNC-1: 写入真实尺寸；未指定时退回默认 M。
          size: input.size ?? 'M',
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

    for (let attempt = 1; attempt <= MARK_STORED_MAX_ATTEMPTS; attempt += 1) {
      const pickupCode = await input.reservePickupCode();
      try {
        const event = await this.tenantPrisma.withTenant(async (tx) => {
          const before = await tx.parcel.findUniqueOrThrow({
            where: { id: parcelId },
          });
          ParcelAggregate.assertTransit(
            before.status as ParcelStatus,
            'STORED',
          );

          const result = await tx.parcel.updateMany({
            where: {
              id: parcelId,
              status: before.status,
              version: before.version,
            },
            data: {
              pickupCode,
              slotId: input.slotId,
              status: 'STORED',
              storedAt: new Date(),
              version: { increment: 1 },
            },
          });
          if (result.count !== 1) {
            throw new BizError(ApiCode.ILLEGAL_TRANSITION, '包裹状态已变化');
          }

          const parcel = await tx.parcel.findUniqueOrThrow({
            where: { id: parcelId },
          });
          const slot = await tx.slot.findUnique({
            where: { id: input.slotId },
          });
          await tx.parcelEvent.create({
            data: {
              tenantId: parcel.tenantId,
              parcelId: parcel.id,
              fromStatus: before.status,
              toStatus: 'STORED',
              eventType: 'STORED',
              operatorId: ctx.userId,
              payload: {
                pickupCode,
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
      } catch (error) {
        // ux_parcel_active_code(station_id, pickup_code) collided: another
        // active parcel already holds this code. Regenerate and retry instead
        // of leaking a raw 500.
        if (this.isPickupCodeConflict(error)) {
          if (attempt < MARK_STORED_MAX_ATTEMPTS) {
            continue;
          }
          throw new BizError(
            ApiCode.PICKUP_CODE_CONFLICT,
            '取件码冲突，请重试',
          );
        }
        throw error;
      }
    }

    // Unreachable: the loop either returns, continues, or throws above.
    throw new BizError(ApiCode.PICKUP_CODE_CONFLICT, '取件码冲突，请重试');
  }

  private isPickupCodeConflict(error: unknown): boolean {
    return (error as { code?: string } | null)?.code === 'P2002';
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

  async markException(parcelId: string, input: MarkExceptionInput) {
    const ctx = this.requireContext();
    const result = await this.tenantPrisma.withTenant(async (tx) => {
      const before = await tx.parcel.findUniqueOrThrow({
        where: { id: parcelId },
      });
      this.assertTransitionFrom(before.status as ParcelStatus, 'EXCEPTION', [
        'STORED',
      ]);

      await this.optimisticParcelUpdate(tx, {
        parcelId,
        status: before.status as ParcelStatus,
        version: before.version,
        data: {
          status: 'EXCEPTION',
          version: { increment: 1 },
        },
      });

      const parcel = await tx.parcel.findUnique({ where: { id: parcelId } });
      await tx.parcelEvent.create({
        data: {
          tenantId: before.tenantId,
          parcelId,
          fromStatus: before.status,
          toStatus: 'EXCEPTION',
          eventType: 'EXCEPTION',
          operatorId: ctx.userId,
          payload: {
            type: input.type,
            description: input.description,
            severity: input.severity,
            evidenceUrls: input.evidenceUrls ?? [],
            exceptionId: input.exceptionId,
            slotId: before.slotId,
          },
        },
      });

      return {
        parcel,
        event: EventBus.createEvent('ParcelMarkedException', {
          parcelId,
          tenantId: before.tenantId,
          stationId: before.stationId,
          slotId: before.slotId,
          exceptionId: input.exceptionId,
          type: input.type,
        }),
      };
    });

    await this.eventBus.publish(result.event);
    return result.parcel;
  }

  async restock(parcelId: string, input: RestockInput = {}) {
    const ctx = this.requireContext();
    return this.tenantPrisma.withTenant(async (tx) => {
      const before = await tx.parcel.findUniqueOrThrow({
        where: { id: parcelId },
      });
      ParcelAggregate.assertTransit(before.status as ParcelStatus, 'STORED');

      await this.optimisticParcelUpdate(tx, {
        parcelId,
        status: before.status as ParcelStatus,
        version: before.version,
        data: {
          status: 'STORED',
          lastOverdueLevel: 0,
          version: { increment: 1 },
        },
      });

      const parcel = await tx.parcel.findUnique({ where: { id: parcelId } });
      await tx.parcelEvent.create({
        data: {
          tenantId: before.tenantId,
          parcelId,
          fromStatus: before.status,
          toStatus: 'STORED',
          eventType: 'STORED',
          operatorId: ctx.userId,
          payload: {
            reason: input.reason,
            slotId: before.slotId,
            resetOverdueLevel: true,
          },
        },
      });

      return parcel;
    });
  }

  async returnParcel(parcelId: string, input: ReturnParcelInput) {
    const ctx = this.requireContext();
    const result = await this.tenantPrisma.withTenant(async (tx) => {
      const before = await tx.parcel.findUniqueOrThrow({
        where: { id: parcelId },
      });
      ParcelAggregate.assertTransit(before.status as ParcelStatus, 'RETURNED');

      const returnedAt = new Date();
      await this.optimisticParcelUpdate(tx, {
        parcelId,
        status: before.status as ParcelStatus,
        version: before.version,
        data: {
          status: 'RETURNED',
          overdueReturnedAt: returnedAt,
          version: { increment: 1 },
        },
      });

      const parcel = await tx.parcel.findUnique({ where: { id: parcelId } });
      await tx.parcelEvent.create({
        data: {
          tenantId: before.tenantId,
          parcelId,
          fromStatus: before.status,
          toStatus: 'RETURNED',
          eventType: 'RETURNED',
          operatorId: ctx.userId,
          payload: {
            cause: input.cause,
            reason: input.reason,
            slotId: before.slotId,
            returnedAt,
          },
        },
      });

      return {
        parcel,
        event: EventBus.createEvent('ParcelReturned', {
          parcelId,
          tenantId: before.tenantId,
          stationId: before.stationId,
          slotId: before.slotId,
          cause: input.cause,
        }),
      };
    });

    await this.eventBus.publish(result.event);
    return result.parcel;
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

  async listForAssistantTool(input: ListAssistantParcelsInput) {
    const ctx = TenantContext.get();
    if (!ctx?.tenantId) {
      return TenantContext.run(
        {
          userId: 'assistant-tool',
          tenantId: input.tenantId,
          roles: [],
          isPlatform: false,
        },
        () => this.listForAssistantTool(input),
      );
    }
    if (ctx.tenantId !== input.tenantId) {
      throw new BizError(ApiCode.FORBIDDEN, '租户上下文不匹配');
    }

    const take = Math.min(Math.max(input.limit ?? 10, 1), 20);
    const where: Record<string, unknown> = {
      tenantId: input.tenantId,
      receiverPhone: input.receiverPhone,
      deletedAt: null,
    };
    if (input.status && input.status !== 'ALL') {
      where.status = this.parseStatus(input.status);
    }

    return this.tenantPrisma.withTenant((tx) =>
      tx.parcel.findMany({
        where,
        include: {
          station: true,
          slot: true,
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
    );
  }

  async getAssistantOwnedParcel(input: AssistantOwnedParcelInput) {
    const ctx = TenantContext.get();
    if (!ctx?.tenantId) {
      return TenantContext.run(
        {
          userId: 'assistant-tool',
          tenantId: input.tenantId,
          roles: [],
          isPlatform: false,
        },
        () => this.getAssistantOwnedParcel(input),
      );
    }
    if (ctx.tenantId !== input.tenantId) {
      throw new BizError(ApiCode.FORBIDDEN, '租户上下文不匹配');
    }

    return this.tenantPrisma.withTenant((tx) =>
      tx.parcel.findFirst({
        where: {
          id: input.parcelId,
          tenantId: input.tenantId,
          receiverPhone: input.receiverPhone,
          deletedAt: null,
        },
        include: {
          station: true,
          slot: true,
        },
      }),
    );
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

  async listOverdue(input: ListOverdueInput) {
    const page = this.parsePositiveInt(input.page, 1);
    const size = Math.min(this.parsePositiveInt(input.size, 20), 100);
    const expectedLevel = input.level ? Number(input.level) : null;

    return this.tenantPrisma.withTenant(async (tx) => {
      const rows = await tx.parcel.findMany({
        where: {
          status: 'STORED',
          storedAt: { not: null },
        },
        include: {
          station: true,
          slot: true,
        },
        orderBy: { storedAt: 'asc' },
        take: 1000,
      });
      const now = new Date();
      const list = rows
        .map((parcel: any) => {
          const daysOverdue = parcel.storedAt
            ? Math.floor(
                (now.getTime() - parcel.storedAt.getTime()) /
                  (24 * 60 * 60 * 1000),
              )
            : 0;
          const overdueLevel =
            daysOverdue >= 11
              ? 3
              : daysOverdue >= 7
                ? 2
                : daysOverdue >= 3
                  ? 1
                  : 0;
          return {
            ...this.toParcelDto(parcel),
            daysOverdue,
            overdueLevel,
            lastOverdueLevel: parcel.lastOverdueLevel,
          };
        })
        .filter((parcel: any) => parcel.overdueLevel > 0)
        .filter((parcel: any) =>
          expectedLevel ? parcel.overdueLevel === expectedLevel : true,
        );

      return {
        list: list.slice((page - 1) * size, page * size),
        total: list.length,
        page,
        size,
      };
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
    if (input.waybillNo) {
      where.waybillNo = { contains: input.waybillNo };
    }
    if (input.slot) {
      where.slot = { is: { code: input.slot } };
    }
    // 强制把可见门店收敛到登录用户作用域：店员仅可见被分配门店的在库包裹。
    const ctx = TenantContext.get();
    const stationFilter = resolveStationFilter({
      isPlatform: !!ctx?.isPlatform,
      allStations: !!ctx?.allStations,
      stations: ctx?.stations ?? [],
    });
    if (stationFilter) {
      where.stationId = stationFilter.stationId;
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

  private assertTransitionFrom(
    from: ParcelStatus,
    to: ParcelStatus,
    allowedFrom: ParcelStatus[],
  ) {
    if (!allowedFrom.includes(from)) {
      throw new BizError(
        ApiCode.ILLEGAL_TRANSITION,
        `包裹状态不可从 ${from} 流转到 ${to}`,
      );
    }
    ParcelAggregate.assertTransit(from, to);
  }

  private async optimisticParcelUpdate(
    tx: any,
    input: {
      parcelId: string;
      status: ParcelStatus;
      version: number;
      data: Record<string, unknown>;
    },
  ) {
    const result = await tx.parcel.updateMany({
      where: {
        id: input.parcelId,
        status: input.status,
        version: input.version,
      },
      data: input.data,
    });
    if (result.count !== 1) {
      throw new BizError(ApiCode.ILLEGAL_TRANSITION, '包裹状态已变化');
    }
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
