import { Injectable } from '@nestjs/common';
import { AuditActorType, AuditResult } from '@prisma/client';
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
}
