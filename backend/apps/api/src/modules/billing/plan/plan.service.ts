import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../../core/http/api-code';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { PLAN_KEY_BY_METRIC } from '../usage/usage.metric';

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
    this.assertPlanPayload(input);
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
    this.assertPlanPayload(patch);
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

  private assertPlanPayload(input: Partial<PlanInput>) {
    if (input.monthlyPrice !== undefined) {
      this.assertNonNegativeInteger(input.monthlyPrice, '套餐月费必须是整数分');
    }
    if (input.quotas !== undefined) {
      this.assertMetricPayload(input.quotas, '套餐配额', {
        allowUnlimited: true,
      });
    }
    if (input.overagePrices !== undefined) {
      this.assertMetricPayload(input.overagePrices, '套餐超额单价', {
        allowUnlimited: false,
      });
    }
  }

  private assertMetricPayload(
    payload: Record<string, number>,
    label: string,
    options: { allowUnlimited: boolean },
  ) {
    const allowedKeys = new Set(Object.values(PLAN_KEY_BY_METRIC));
    for (const [key, value] of Object.entries(payload ?? {})) {
      if (!allowedKeys.has(key)) {
        throw new BizError(ApiCode.BAD_REQUEST, `${label}包含未知键`);
      }
      if (!Number.isInteger(value)) {
        throw new BizError(ApiCode.BAD_REQUEST, `${label}必须是整数分`);
      }
      const min = options.allowUnlimited ? -1 : 0;
      if (value < min) {
        throw new BizError(ApiCode.BAD_REQUEST, `${label}不能小于 ${min}`);
      }
    }
  }

  private assertNonNegativeInteger(value: number, message: string) {
    if (!Number.isInteger(value) || value < 0) {
      throw new BizError(ApiCode.BAD_REQUEST, message);
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
