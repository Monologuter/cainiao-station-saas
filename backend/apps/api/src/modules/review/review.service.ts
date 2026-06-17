import { Injectable } from '@nestjs/common';
import { ApiCode, BizError } from '../../core/http/api-code';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantPrismaService } from '../../core/prisma/tenant-prisma.service';
import { TenantContext } from '../../core/tenant-context/tenant-context';

type ReviewTargetType = 'PICKUP' | 'SHIP';
type ComplaintType = 'DAMAGE' | 'LOST' | 'SERVICE' | 'WRONG' | 'OTHER';
type ComplaintStatus = 'PENDING' | 'PROCESSING' | 'RESOLVED' | 'CLOSED';

interface SubmitReviewInput {
  stationId: string;
  targetType: ReviewTargetType;
  refType: string;
  refId: string;
  rating: number;
  tags?: string[];
  content?: string;
  images?: string[];
}

interface SubmitComplaintInput {
  stationId: string;
  type: ComplaintType;
  content: string;
  refType?: string;
  refId?: string;
  images?: string[];
}

interface HandleComplaintInput {
  status: ComplaintStatus;
  note?: string;
}

@Injectable()
export class ReviewService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma?: PrismaService,
  ) {}

  async submit(memberId: string, input: SubmitReviewInput) {
    this.assertRating(input.rating);
    const ctx = this.requireContext();

    return this.tenantPrisma.withTenant(async (tx) => {
      const member = await tx.member.findUniqueOrThrow({
        where: { id: memberId },
      });
      const exists = await tx.review.findFirst({
        where: {
          tenantId: ctx.tenantId,
          refType: input.refType,
          refId: input.refId,
          memberId,
        },
      });
      if (exists) {
        throw new BizError(ApiCode.IDEMPOTENCY_CONFLICT, '该业务单已评价');
      }

      return tx.review.create({
        data: {
          tenantId: ctx.tenantId,
          stationId: input.stationId,
          memberId,
          consumerPhone: member.phone,
          targetType: input.targetType,
          refType: input.refType,
          refId: input.refId,
          rating: input.rating,
          tags: input.tags ?? [],
          content: input.content,
          images: input.images ?? [],
        },
      });
    });
  }

  listForStation(
    tenantId: string,
    query: {
      stationId?: string;
      rating?: number;
      status?: string;
      page?: string | number;
      size?: string | number;
    } = {},
  ) {
    const page = this.parsePositiveInt(query.page, 1);
    const size = Math.min(this.parsePositiveInt(query.size, 20), 100);
    const where: any = { tenantId };
    if (query.stationId) {
      where.stationId = query.stationId;
    }
    if (query.rating) {
      where.rating = Number(query.rating);
    }
    if (query.status) {
      where.status = query.status;
    }

    return this.tenantPrisma.withTenant(async (tx) => {
      const [total, list] = await Promise.all([
        tx.review.count({ where }),
        tx.review.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * size,
          take: size,
        }),
      ]);
      return { list, total, page, size };
    });
  }

  listMine(memberId: string, type: 'review' | 'complaint') {
    return this.withBypass(async (tx) => {
      if (type === 'review') {
        const list = await tx.review.findMany({
          where: { memberId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
        });
        return { list, total: list.length, page: 1, size: list.length };
      }

      const list = await tx.complaint.findMany({
        where: { memberId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      return { list, total: list.length, page: 1, size: list.length };
    });
  }

  listComplaints(
    tenantId: string,
    query: {
      stationId?: string;
      status?: string;
      page?: string | number;
      size?: string | number;
    } = {},
  ) {
    const page = this.parsePositiveInt(query.page, 1);
    const size = Math.min(this.parsePositiveInt(query.size, 20), 100);
    const where: any = { tenantId };
    if (query.stationId) {
      where.stationId = query.stationId;
    }
    if (query.status) {
      where.status = query.status;
    }

    return this.tenantPrisma.withTenant(async (tx) => {
      const [total, list] = await Promise.all([
        tx.complaint.count({ where }),
        tx.complaint.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * size,
          take: size,
        }),
      ]);
      return { list, total, page, size };
    });
  }

  async reply(reviewId: string, staffId: string, content: string) {
    return this.tenantPrisma.withTenant(async (tx) => {
      const review = await tx.review.findUniqueOrThrow({
        where: { id: reviewId },
      });
      if (review.status !== 'PUBLISHED') {
        throw new BizError(ApiCode.ILLEGAL_TRANSITION, '评价状态流转非法');
      }
      return tx.review.update({
        where: { id: reviewId },
        data: {
          status: 'REPLIED',
          replyContent: content,
          repliedBy: staffId,
          repliedAt: new Date(),
        },
      });
    });
  }

  async hide(reviewId: string, staffId: string, reason?: string) {
    return this.tenantPrisma.withTenant(async (tx) => {
      const review = await tx.review.findUniqueOrThrow({
        where: { id: reviewId },
      });
      if (!['PUBLISHED', 'REPLIED'].includes(review.status)) {
        throw new BizError(ApiCode.ILLEGAL_TRANSITION, '评价状态流转非法');
      }
      return tx.review.update({
        where: { id: reviewId },
        data: {
          status: 'HIDDEN',
          hiddenBy: staffId,
          hiddenAt: new Date(),
          hideReason: reason,
        },
      });
    });
  }

  async submitComplaint(memberId: string, input: SubmitComplaintInput) {
    const ctx = this.requireContext();
    return this.tenantPrisma.withTenant(async (tx) => {
      const member = await tx.member.findUniqueOrThrow({
        where: { id: memberId },
      });
      return tx.complaint.create({
        data: {
          tenantId: ctx.tenantId,
          stationId: input.stationId,
          memberId,
          consumerPhone: member.phone,
          type: input.type,
          refType: input.refType,
          refId: input.refId,
          content: input.content,
          images: input.images ?? [],
        },
      });
    });
  }

  async handleComplaint(
    complaintId: string,
    staffId: string,
    input: HandleComplaintInput,
  ) {
    return this.tenantPrisma.withTenant(async (tx) => {
      const complaint = await tx.complaint.findUniqueOrThrow({
        where: { id: complaintId },
      });
      this.assertComplaintTransition(complaint.status, input.status);
      return tx.complaint.update({
        where: { id: complaintId },
        data: {
          status: input.status,
          handleNote: input.note,
          handledBy: staffId,
          handledAt: new Date(),
        },
      });
    });
  }

  private assertRating(rating: number) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BizError(ApiCode.BAD_REQUEST, '评分必须在 1 到 5 之间');
    }
  }

  private assertComplaintTransition(
    from: ComplaintStatus,
    to: ComplaintStatus,
  ) {
    const allowed: Record<ComplaintStatus, ComplaintStatus[]> = {
      PENDING: ['PROCESSING'],
      PROCESSING: ['RESOLVED'],
      RESOLVED: ['CLOSED'],
      CLOSED: [],
    };
    if (!allowed[from]?.includes(to)) {
      throw new BizError(ApiCode.ILLEGAL_TRANSITION, '投诉状态流转非法');
    }
  }

  private requireContext() {
    const ctx = TenantContext.get();
    if (!ctx?.tenantId) {
      throw new BizError(ApiCode.BAD_REQUEST, '缺少租户上下文');
    }
    return { ...ctx, tenantId: ctx.tenantId };
  }

  private parsePositiveInt(
    value: string | number | undefined,
    fallback: number,
  ) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private async withBypass<T>(fn: (tx: any) => Promise<T>) {
    if (!this.prisma) {
      return this.tenantPrisma.withTenant(fn);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return fn(tx);
    });
  }
}
