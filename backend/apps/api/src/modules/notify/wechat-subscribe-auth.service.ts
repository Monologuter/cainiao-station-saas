import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';

interface GrantInput {
  tenantId: string;
  consumerId: string;
  openid: string;
  templateId: string;
  count?: number;
}

interface ConsumeInput {
  tenantId: string;
  consumerId: string;
  templateId: string;
}

@Injectable()
export class WechatSubscribeAuthService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  grant(input: GrantInput) {
    const count = Math.max(Number(input.count ?? 1), 1);
    return this.tenantPrisma.withTenant((tx) =>
      tx.wechatSubscribeAuthorization.upsert({
        where: {
          tenantId_consumerId_templateId: {
            tenantId: input.tenantId,
            consumerId: input.consumerId,
            templateId: input.templateId,
          },
        },
        update: {
          openid: input.openid,
          remainingCount: { increment: count },
        },
        create: {
          tenantId: input.tenantId,
          consumerId: input.consumerId,
          openid: input.openid,
          templateId: input.templateId,
          remainingCount: count,
        },
      }),
    );
  }

  async consume(input: ConsumeInput) {
    const auth = await this.tenantPrisma.withTenant<any>((tx) =>
      tx.wechatSubscribeAuthorization.findFirst({
        where: {
          tenantId: input.tenantId,
          consumerId: input.consumerId,
          templateId: input.templateId,
          remainingCount: { gt: 0 },
        },
        orderBy: { updatedAt: 'desc' },
      }),
    );
    if (!auth) {
      return { ok: false as const };
    }

    const updated = await this.tenantPrisma.withTenant<{ count: number }>(
      (tx) =>
        tx.wechatSubscribeAuthorization.updateMany({
          where: { id: auth.id, remainingCount: { gt: 0 } },
          data: { remainingCount: { decrement: 1 } },
        }),
    );

    return updated.count === 1
      ? { ok: true as const, openid: auth.openid }
      : { ok: false as const };
  }
}
