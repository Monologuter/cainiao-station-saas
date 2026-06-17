import { Injectable } from '@nestjs/common';
import { PointRecordType } from '@prisma/client';
import { ApiCode, BizError } from '../../core/http/api-code';
import { PrismaService } from '../../core/prisma/prisma.service';
import { RedisService } from '../../core/redis/redis.service';

interface PointContext {
  sourceTenantId?: string;
  refType?: string;
  refId?: string;
  idempotencyKey: string;
  remark?: string;
}

interface PointRecordQuery {
  type?: PointRecordType | '';
  page?: number;
  size?: number;
}

@Injectable()
export class PointService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async earn(
    memberId: string,
    change: number,
    type: PointRecordType,
    ctx: PointContext,
  ) {
    if (change <= 0) {
      throw new BizError(ApiCode.BAD_REQUEST, '加分必须大于 0');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.pointRecord.findUnique({
        where: { idempotencyKey: ctx.idempotencyKey },
      });
      if (existing) {
        return { record: existing, created: false };
      }

      const member = await tx.member.update({
        where: { id: memberId },
        data: {
          totalPoints: { increment: change },
          availablePoints: { increment: change },
        },
      });

      const record = await tx.pointRecord.create({
        data: {
          memberId,
          change,
          balanceAfter: member.availablePoints,
          type,
          sourceTenantId: ctx.sourceTenantId,
          refType: ctx.refType,
          refId: ctx.refId,
          idempotencyKey: ctx.idempotencyKey,
          remark: ctx.remark,
        },
      });
      return { record, created: true };
    });

    if (result.created && ctx.sourceTenantId && result.record.change > 0) {
      await this.redis
        .getClient()
        .zincrby(
          `rank:points:${ctx.sourceTenantId}`,
          result.record.change,
          memberId,
        );
    }
    return result.record;
  }

  async spend(
    memberId: string,
    amount: number,
    type: PointRecordType,
    ctx: PointContext,
  ) {
    if (amount <= 0) {
      throw new BizError(ApiCode.BAD_REQUEST, '扣分必须大于 0');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.pointRecord.findUnique({
        where: { idempotencyKey: ctx.idempotencyKey },
      });
      if (existing) {
        return existing;
      }

      const before = await tx.member.findUniqueOrThrow({
        where: { id: memberId },
      });
      if (before.availablePoints < amount) {
        throw new BizError(ApiCode.BAD_REQUEST, '积分余额不足');
      }

      const member = await tx.member.update({
        where: { id: memberId },
        data: { availablePoints: { decrement: amount } },
      });

      return tx.pointRecord.create({
        data: {
          memberId,
          change: -amount,
          balanceAfter: member.availablePoints,
          type,
          sourceTenantId: ctx.sourceTenantId,
          refType: ctx.refType,
          refId: ctx.refId,
          idempotencyKey: ctx.idempotencyKey,
          remark: ctx.remark,
        },
      });
    });
  }

  async getRecords(memberId: string, query: PointRecordQuery = {}) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const size = query.size && query.size > 0 ? Math.min(query.size, 100) : 20;
    const where = {
      memberId,
      ...(query.type ? { type: query.type } : {}),
    };

    return this.prisma.$transaction(async (tx) => {
      const [total, list] = await Promise.all([
        tx.pointRecord.count({ where }),
        tx.pointRecord.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * size,
          take: size,
        }),
      ]);
      return { list, total, page, size };
    });
  }

  async getRank(tenantId: string, memberId: string) {
    const key = `rank:points:${tenantId}`;
    const client = this.redis.getClient();
    const raw = await client.zrevrange(key, 0, 9, 'WITHSCORES');
    const top = [];
    for (let index = 0; index < raw.length; index += 2) {
      top.push({
        memberId: raw[index],
        score: Number(raw[index + 1]),
        rank: index / 2 + 1,
      });
    }

    const [rank, score] = await Promise.all([
      client.zrevrank(key, memberId),
      client.zscore(key, memberId),
    ]);

    return {
      top,
      self: {
        memberId,
        score: Number(score ?? 0),
        rank: rank === null ? null : rank + 1,
      },
    };
  }
}
