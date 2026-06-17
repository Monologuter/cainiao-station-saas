import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../../core/http/api-code';
import { PrismaService } from '../../../core/prisma/prisma.service';

interface PlanInput {
  code: string;
  name: string;
  monthlyPrice: number;
  quotas: Record<string, number>;
  overagePrices: Record<string, number>;
  sort?: number;
  description?: string;
}

@Injectable()
export class PlanService {
  constructor(private readonly prisma: PrismaService) {}

  async createPlan(input: PlanInput) {
    const plan = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.billingPlan.create({
        data: {
          code: input.code.toUpperCase(),
          name: input.name,
          monthlyPrice: input.monthlyPrice,
          quotas: input.quotas ?? {},
          overagePrices: input.overagePrices ?? {},
          status: 'ACTIVE',
          sort: input.sort ?? 0,
          description: input.description,
        },
      });
    });
    return this.toDto(plan);
  }

  async updatePlan(id: string, patch: Partial<PlanInput>) {
    const plan = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.billingPlan.update({
        where: { id },
        data: {
          name: patch.name,
          monthlyPrice: patch.monthlyPrice,
          quotas: patch.quotas,
          overagePrices: patch.overagePrices,
          sort: patch.sort,
          description: patch.description,
        },
      });
    });
    return this.toDto(plan);
  }

  async archivePlan(id: string) {
    const plan = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.billingPlan.update({
        where: { id },
        data: { status: 'ARCHIVED' },
      });
    });
    return this.toDto(plan);
  }

  async listActivePlans() {
    const plans = await this.prisma.billingPlan.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      orderBy: [{ sort: 'asc' }, { monthlyPrice: 'asc' }],
    });
    return plans.map((plan) => this.toDto(plan));
  }

  async assertPlatform(user: any) {
    if (!user?.isPlatform) {
      throw new BizError(ApiCode.FORBIDDEN, '无权限执行该操作');
    }
  }

  private toDto(plan: any) {
    return {
      ...plan,
      monthlyPrice:
        plan.monthlyPrice === undefined ? undefined : Number(plan.monthlyPrice),
    };
  }
}
