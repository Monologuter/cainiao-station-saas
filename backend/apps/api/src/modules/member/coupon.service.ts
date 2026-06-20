import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiCode, BizError } from '../../core/http/api-code';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { PointService } from './point.service';

interface CreateCouponTemplateInput {
  name: string;
  type: 'DISCOUNT' | 'RATE' | 'EXEMPT';
  faceValue: number;
  threshold: number;
  scene: 'PICKUP' | 'SHIP' | 'ALL';
  costPoints?: number;
  totalStock?: number;
  validDays: number;
}

interface VerifyCouponInput {
  usedRefType: string;
  usedRefId: string;
  idempotencyKey: string;
}

interface CouponTemplateQuery {
  tenantId: string;
  scene?: 'PICKUP' | 'SHIP' | 'ALL';
}

@Injectable()
export class CouponService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly points: PointService,
  ) {}

  createTemplate(tenantId: string, input: CreateCouponTemplateInput) {
    return this.tenantPrisma.withTenant((tx) =>
      tx.couponTemplate.create({
        data: {
          tenantId,
          name: input.name,
          type: input.type,
          faceValue: input.faceValue,
          threshold: input.threshold,
          scene: input.scene,
          costPoints: input.costPoints,
          totalStock: input.totalStock,
          validDays: input.validDays,
          issuedCount: 0,
          status: 'ACTIVE',
        },
      }),
    );
  }

  async listTemplates(query: CouponTemplateQuery) {
    // 强制按租户隔离：缺 tenantId 直接拒绝，杜绝"未传则返回全库模板"的跨租户泄露。
    if (!query?.tenantId) {
      throw new BizError(ApiCode.BAD_REQUEST, '缺少租户参数');
    }
    return this.withBypass(async (tx) => {
      const where: any = {
        tenantId: query.tenantId,
        status: 'ACTIVE',
        deletedAt: null,
      };
      if (query.scene) {
        where.scene = {
          in: query.scene === 'ALL' ? ['ALL'] : [query.scene, 'ALL'],
        };
      }
      const list = await tx.couponTemplate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
      return { list, total: list.length, page: 1, size: list.length };
    });
  }

  listMemberCoupons(memberId: string, status?: string) {
    return this.withBypass(async (tx) => {
      const list = await tx.coupon.findMany({
        where: {
          memberId,
          status,
        },
        include: { template: true },
        orderBy: { createdAt: 'desc' },
      });
      return { list, total: list.length, page: 1, size: list.length };
    });
  }

  async redeemByPoints(memberId: string, templateId: string) {
    const code = this.nextCode();
    const template: any = await this.withBypass((tx) =>
      tx.couponTemplate.findUniqueOrThrow({ where: { id: templateId } }),
    );
    if (template.status !== 'ACTIVE') {
      throw new BizError(ApiCode.BAD_REQUEST, '券模板不可用');
    }
    if (!template.costPoints || template.costPoints <= 0) {
      throw new BizError(ApiCode.BAD_REQUEST, '券不支持积分兑换');
    }
    if (
      template.totalStock !== null &&
      template.issuedCount >= template.totalStock
    ) {
      throw new BizError(ApiCode.BAD_REQUEST, '券库存不足');
    }

    const point = await this.points.spend(
      memberId,
      template.costPoints,
      'COUPON_REDEEM',
      {
        sourceTenantId: template.tenantId,
        refType: 'coupon_template',
        refId: template.id,
        idempotencyKey: `coupon-redeem:${code}`,
        remark: '积分兑换券',
      },
    );

    return this.withBypass(async (tx) => {
      await tx.couponTemplate.update({
        where: { id: template.id },
        data: { issuedCount: { increment: 1 } },
      });
      return tx.coupon.create({
        data: {
          tenantId: template.tenantId,
          templateId: template.id,
          memberId,
          code,
          status: 'UNUSED',
          obtainedVia: 'POINT_REDEEM',
          pointRecordId: point.id,
          expireAt: this.daysFromNow(template.validDays),
        },
      });
    });
  }

  async verify(id: string, input: VerifyCouponInput) {
    return this.tenantPrisma.withTenant(async (tx) => {
      const coupon = await tx.coupon.findUniqueOrThrow({ where: { id } });
      if (
        coupon.status === 'USED' &&
        coupon.usedRefType === input.usedRefType &&
        coupon.usedRefId === input.usedRefId
      ) {
        return coupon;
      }
      if (coupon.status !== 'UNUSED') {
        throw new BizError(ApiCode.BAD_REQUEST, '券不可核销');
      }
      if (coupon.expireAt.getTime() < Date.now()) {
        throw new BizError(ApiCode.BAD_REQUEST, '券已过期');
      }
      return tx.coupon.update({
        where: { id },
        data: {
          status: 'USED',
          usedRefType: input.usedRefType,
          usedRefId: input.usedRefId,
          usedAt: new Date(),
        },
      });
    });
  }

  async verifyForMember(
    memberId: string,
    id: string,
    input: VerifyCouponInput,
  ) {
    return this.withBypass(async (tx) => {
      const coupon = await tx.coupon.findFirstOrThrow({
        where: { id, memberId },
        include: { template: true },
      });
      if (
        coupon.status === 'USED' &&
        coupon.usedRefType === input.usedRefType &&
        coupon.usedRefId === input.usedRefId
      ) {
        return coupon;
      }
      if (coupon.status !== 'UNUSED') {
        throw new BizError(ApiCode.BAD_REQUEST, '券不可核销');
      }
      if (coupon.expireAt.getTime() < Date.now()) {
        throw new BizError(ApiCode.BAD_REQUEST, '券已过期');
      }
      return tx.coupon.update({
        where: { id },
        data: {
          status: 'USED',
          usedRefType: input.usedRefType,
          usedRefId: input.usedRefId,
          usedAt: new Date(),
        },
        include: { template: true },
      });
    });
  }

  async revertToUnused(id: string, usedRefType: string, usedRefId: string) {
    return this.withBypass(async (tx) =>
      this.revertToUnusedInTx(tx, id, usedRefType, usedRefId),
    );
  }

  async revertToUnusedInTx(
    tx: any,
    id: string,
    usedRefType: string,
    usedRefId: string,
  ) {
    const result = await tx.coupon.updateMany({
      where: {
        id,
        status: 'USED',
        usedRefType,
        usedRefId,
      },
      data: {
        status: 'UNUSED',
        usedAt: null,
        usedRefType: null,
        usedRefId: null,
      },
    });
    return result.count === 1;
  }

  async issue(tenantId: string, templateId: string, memberIds: string[]) {
    const template: any = await this.withBypass((tx) =>
      tx.couponTemplate.findFirstOrThrow({
        where: { id: templateId, tenantId },
      }),
    );
    if (template.status !== 'ACTIVE') {
      throw new BizError(ApiCode.BAD_REQUEST, '券模板不可用');
    }
    if (
      template.totalStock !== null &&
      template.issuedCount + memberIds.length > template.totalStock
    ) {
      throw new BizError(ApiCode.BAD_REQUEST, '券库存不足');
    }

    return this.withBypass(async (tx) => {
      await tx.couponTemplate.update({
        where: { id: templateId },
        data: { issuedCount: { increment: memberIds.length } },
      });
      await tx.coupon.createMany({
        data: memberIds.map((memberId) => ({
          tenantId,
          templateId,
          memberId,
          code: this.nextCode(),
          status: 'UNUSED',
          obtainedVia: 'ISSUE',
          expireAt: this.daysFromNow(template.validDays),
        })),
      });
      return memberIds.length;
    });
  }

  async expireScan() {
    const result: { count: number } = await this.withBypass((tx) =>
      tx.coupon.updateMany({
        where: {
          status: 'UNUSED',
          expireAt: { lt: new Date() },
        },
        data: { status: 'EXPIRED' },
      }),
    );
    return result.count;
  }

  private async withBypass<T>(fn: (tx: any) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return fn(tx);
    });
  }

  private nextCode() {
    return `CP${randomUUID().replaceAll('-', '').slice(0, 18).toUpperCase()}`;
  }

  private daysFromNow(days: number) {
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
