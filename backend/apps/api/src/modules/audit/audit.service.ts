import { Injectable } from '@nestjs/common';
import { AuditActorType, AuditResult } from '@prisma/client';
import { ApiCode, BizError } from '../../core/http/api-code';
import { PrismaService } from '../../core/prisma/prisma.service';

export type AuditRecordInput = {
  tenantId?: string | null;
  actorId?: string | null;
  actorType: keyof typeof AuditActorType;
  actorName?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  result: keyof typeof AuditResult;
  summary?: string | null;
  before?: unknown;
  after?: unknown;
  diff?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type AuditQuery = {
  tenantId?: string;
  actorId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  result?: keyof typeof AuditResult;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditRecordInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId ?? null,
          actorId: input.actorId ?? null,
          actorType: input.actorType,
          actorName: input.actorName ?? null,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          result: input.result,
          summary: input.summary ?? null,
          before: input.before as any,
          after: input.after as any,
          diff: input.diff as any,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          requestId: input.requestId ?? null,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage ?? null,
        },
      });
    });
  }

  async query(input: AuditQuery) {
    return this.withBypass(async (tx) => {
      const where = this.toWhere(input);
      const [total, items] = await Promise.all([
        tx.auditLog.count({ where }),
        tx.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
      ]);

      return {
        total,
        page: input.page,
        pageSize: input.pageSize,
        items,
      };
    });
  }

  async findOne(id: string) {
    return this.withBypass(async (tx) => {
      const item = await tx.auditLog.findUnique({ where: { id } });
      if (!item) {
        throw new BizError(ApiCode.NOT_FOUND, '审计日志不存在');
      }
      return item;
    });
  }

  async listActions() {
    return this.withBypass(async (tx) => {
      const rows = await tx.auditLog.findMany({
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      });
      return rows.map((row) => row.action);
    });
  }

  private toWhere(input: AuditQuery) {
    return {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      result: input.result,
      createdAt:
        input.from || input.to
          ? {
              gte: input.from,
              lte: input.to,
            }
          : undefined,
    };
  }

  private async withBypass<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return fn(tx);
    });
  }
}
