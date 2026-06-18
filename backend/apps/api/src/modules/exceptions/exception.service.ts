import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { resolveStationFilter } from '../../core/tenant-context/station-scope';
import { ParcelService } from '../parcel/parcel.service';
import { ParcelAggregate, ParcelStatus } from '../parcel/parcel.aggregate';
import { ExceptionAggregate, ExceptionStatus } from './exception.aggregate';

type ExceptionType =
  | 'DAMAGED'
  | 'MISDELIVERED'
  | 'UNCLAIMED'
  | 'REJECTED'
  | 'OVERSIZED';

type Severity = 'LOW' | 'MEDIUM' | 'HIGH';
type ExceptionResolution = 'CONTACT_COURIER' | 'RETURN' | 'RESTOCK' | 'VOID';

interface CreateExceptionInput {
  parcelId?: string;
  stationId?: string;
  type: ExceptionType;
  description: string;
  severity?: Severity;
  evidenceUrls?: string[];
}

interface ResolveExceptionInput {
  resolution: ExceptionResolution;
  note?: string;
}

interface ListExceptionInput {
  status?: string;
  type?: string;
  stationId?: string;
  keyword?: string;
  page?: string;
  size?: string;
}

@Injectable()
export class ExceptionService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly parcels: ParcelService,
  ) {}

  async createException(input: CreateExceptionInput) {
    const ctx = this.requireContext();
    const ticket = await this.tenantPrisma.withTenant(async (tx) => {
      const parcel = input.parcelId
        ? await tx.parcel.findUniqueOrThrow({ where: { id: input.parcelId } })
        : null;

      if (input.parcelId) {
        const exists = await tx.exceptionTicket.findFirst({
          where: {
            parcelId: input.parcelId,
            status: { not: 'RESOLVED' },
          },
        });
        if (exists) {
          throw new BizError(
            ApiCode.ILLEGAL_TRANSITION,
            '包裹已有未结异常工单',
          );
        }
      }

      const stationId = input.stationId ?? parcel?.stationId;
      if (!stationId) {
        throw new BizError(ApiCode.BAD_REQUEST, '缺少门店信息');
      }

      return tx.exceptionTicket.create({
        data: {
          tenantId: ctx.tenantId,
          stationId,
          parcelId: input.parcelId,
          code: this.generateCode(),
          type: input.type,
          description: input.description,
          severity: input.severity,
          evidenceUrls: input.evidenceUrls ?? [],
          parcelStatusBefore: parcel?.status,
          createdBy: ctx.userId,
        },
      });
    });

    if (input.parcelId) {
      await this.parcels.markException(input.parcelId, {
        type: input.type,
        description: input.description,
        severity: input.severity,
        evidenceUrls: input.evidenceUrls ?? [],
        exceptionId: ticket.id,
      });
    }

    return ticket;
  }

  async list(input: ListExceptionInput) {
    const page = this.parsePositiveInt(input.page, 1);
    const size = Math.min(this.parsePositiveInt(input.size, 20), 100);
    const where = this.toListWhere(input);

    return this.tenantPrisma.withTenant(async (tx) => {
      const [total, list] = await Promise.all([
        tx.exceptionTicket.count({ where }),
        tx.exceptionTicket.findMany({
          where,
          include: { parcel: true, station: true },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * size,
          take: size,
        }),
      ]);

      return {
        list: list.map((ticket: any) => this.toDto(ticket)),
        total,
        page,
        size,
      };
    });
  }

  async detail(id: string) {
    return this.tenantPrisma.withTenant(async (tx) => {
      const ticket = await tx.exceptionTicket.findUniqueOrThrow({
        where: { id },
        include: { parcel: true, station: true },
      });
      return this.toDto(ticket);
    });
  }

  async claim(id: string, assigneeId: string) {
    return this.tenantPrisma.withTenant(async (tx) => {
      const before = await tx.exceptionTicket.findUniqueOrThrow({
        where: { id },
      });
      ExceptionAggregate.assertTransit(
        before.status as ExceptionStatus,
        'IN_PROGRESS',
      );

      return tx.exceptionTicket.update({
        where: { id },
        data: { status: 'IN_PROGRESS', assigneeId },
      });
    });
  }

  async resolve(id: string, input: ResolveExceptionInput) {
    const ctx = this.requireContext();
    return this.tenantPrisma.withTenant(async (tx) => {
      const before = await tx.exceptionTicket.findUniqueOrThrow({
        where: { id },
      });
      ExceptionAggregate.assertTransit(
        before.status as ExceptionStatus,
        'RESOLVED',
      );

      const resolvedAt = new Date();
      const claimed = await tx.exceptionTicket.updateMany({
        where: { id, status: before.status },
        data: {
          status: 'RESOLVED',
          resolution: input.resolution,
          resolutionNote: input.note,
          resolvedAt,
        },
      });
      if (claimed.count !== 1) {
        throw new BizError(ApiCode.ILLEGAL_TRANSITION, '异常工单已被处理');
      }

      if (before.parcelId) {
        await this.applyParcelResolution(tx, before.parcelId, input, ctx.userId);
      }

      return tx.exceptionTicket.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolution: input.resolution,
          resolutionNote: input.note,
          resolvedAt,
        },
      });
    });
  }

  private async applyParcelResolution(
    tx: any,
    parcelId: string,
    input: ResolveExceptionInput,
    operatorId?: string,
  ) {
    const before = await tx.parcel.findUniqueOrThrow({ where: { id: parcelId } });

    if (input.resolution === 'RESTOCK') {
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
      await tx.parcelEvent.create({
        data: {
          tenantId: before.tenantId,
          parcelId,
          fromStatus: before.status,
          toStatus: 'STORED',
          eventType: 'STORED',
          operatorId,
          payload: {
            reason: input.note,
            slotId: before.slotId,
            resetOverdueLevel: true,
          },
        },
      });
      return;
    }

    if (input.resolution === 'RETURN' || input.resolution === 'VOID') {
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
      if (before.slotId) {
        await tx.slot.updateMany({
          where: { id: before.slotId, currentParcelId: parcelId },
          data: {
            status: 'FREE',
            currentParcelId: null,
            version: { increment: 1 },
          },
        });
      }
      await tx.parcelEvent.create({
        data: {
          tenantId: before.tenantId,
          parcelId,
          fromStatus: before.status,
          toStatus: 'RETURNED',
          eventType: 'RETURNED',
          operatorId,
          payload: {
            cause: 'EXCEPTION_RETURN',
            reason: input.note,
            slotId: before.slotId,
            returnedAt,
          },
        },
      });
    }
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

  private requireContext() {
    const ctx = TenantContext.get();
    if (!ctx?.tenantId) {
      throw new BizError(ApiCode.BAD_REQUEST, '缺少租户上下文');
    }
    return { ...ctx, tenantId: ctx.tenantId };
  }

  private generateCode() {
    const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const suffix = Date.now().toString(36).toUpperCase();
    return `EX-${day}-${suffix}`;
  }

  private parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private toListWhere(input: ListExceptionInput) {
    const where: any = {};
    if (input.status) {
      where.status = input.status;
    }
    if (input.type) {
      where.type = input.type;
    }
    // 强制把 stationId 收敛到登录用户的可见门店集合，禁止店员越权读其它门店异常工单。
    const ctx = TenantContext.get();
    const stationFilter = resolveStationFilter(
      {
        isPlatform: !!ctx?.isPlatform,
        allStations: !!ctx?.allStations,
        stations: ctx?.stations ?? [],
      },
      input.stationId,
    );
    if (stationFilter) {
      where.stationId = stationFilter.stationId;
    }
    if (input.keyword) {
      where.OR = [
        { code: { contains: input.keyword, mode: 'insensitive' } },
        { description: { contains: input.keyword, mode: 'insensitive' } },
        { parcel: { is: { waybillNo: { contains: input.keyword } } } },
      ];
    }
    return where;
  }

  private toDto(ticket: any) {
    return {
      id: ticket.id,
      tenantId: ticket.tenantId,
      stationId: ticket.stationId,
      parcelId: ticket.parcelId,
      code: ticket.code,
      type: ticket.type,
      status: ticket.status,
      resolution: ticket.resolution,
      severity: ticket.severity,
      description: ticket.description,
      evidenceUrls: ticket.evidenceUrls,
      assigneeId: ticket.assigneeId,
      parcelStatusBefore: ticket.parcelStatusBefore,
      openedAt: ticket.openedAt,
      resolvedAt: ticket.resolvedAt,
      resolutionNote: ticket.resolutionNote,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      station: ticket.station
        ? {
            id: ticket.station.id,
            name: ticket.station.name,
            code: ticket.station.code,
          }
        : null,
      parcel: ticket.parcel
        ? {
            id: ticket.parcel.id,
            waybillNo: ticket.parcel.waybillNo,
            status: ticket.parcel.status,
            pickupCode: ticket.parcel.pickupCode,
            receiverPhoneTail: ticket.parcel.receiverPhoneTail,
          }
        : null,
    };
  }
}
