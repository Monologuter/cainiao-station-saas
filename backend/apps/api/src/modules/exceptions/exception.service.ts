import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { ParcelService } from '../parcel/parcel.service';
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
  stationId: string;
  type: ExceptionType;
  description: string;
  severity?: Severity;
  evidenceUrls?: string[];
}

interface ResolveExceptionInput {
  resolution: ExceptionResolution;
  note?: string;
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

      return tx.exceptionTicket.create({
        data: {
          tenantId: ctx.tenantId,
          stationId: input.stationId,
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
    const before = await this.tenantPrisma.withTenant(async (tx) =>
      tx.exceptionTicket.findUniqueOrThrow({ where: { id } }),
    );
    ExceptionAggregate.assertTransit(
      before.status as ExceptionStatus,
      'RESOLVED',
    );

    if (before.parcelId) {
      await this.applyParcelResolution(before.parcelId, input);
    }

    return this.tenantPrisma.withTenant((tx) =>
      tx.exceptionTicket.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolution: input.resolution,
          resolutionNote: input.note,
          resolvedAt: new Date(),
        },
      }),
    );
  }

  private async applyParcelResolution(
    parcelId: string,
    input: ResolveExceptionInput,
  ) {
    if (input.resolution === 'RESTOCK') {
      await this.parcels.restock(parcelId, { reason: input.note });
      return;
    }
    if (input.resolution === 'RETURN' || input.resolution === 'VOID') {
      await this.parcels.returnParcel(parcelId, {
        cause: 'EXCEPTION_RETURN',
        reason: input.note,
      });
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
}
