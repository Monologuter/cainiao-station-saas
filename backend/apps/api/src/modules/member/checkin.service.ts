import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { checkinPoints } from './point-rule.config';
import { PointService } from './point.service';

@Injectable()
export class CheckinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointService,
  ) {}

  async checkin(memberId: string, now = new Date()) {
    const today = this.toDateOnly(now);
    const todayKey = this.toDateKey(today);

    const existing = await this.prisma.$transaction((tx) =>
      tx.memberCheckin.findUnique({
        where: { memberId_checkinDate: { memberId, checkinDate: today } },
      }),
    );
    if (existing) {
      return {
        checkedIn: true,
        rewardPoints: existing.rewardPoints,
        continuousDays: existing.continuousDays,
        pointRecordId: existing.pointRecordId,
        repeated: true,
      };
    }

    const member = await this.prisma.$transaction((tx) =>
      tx.member.findUniqueOrThrow({ where: { id: memberId } }),
    );
    const continuousDays = this.isYesterday(member.lastCheckinDate, today)
      ? member.continuousCheckinDays + 1
      : 1;
    const rewardPoints = checkinPoints(continuousDays);
    const pointRecord = await this.points.earn(
      memberId,
      rewardPoints,
      'CHECKIN',
      {
        refType: 'checkin',
        refId: todayKey,
        idempotencyKey: `checkin:${memberId}:${todayKey}`,
        remark: '每日签到',
      },
    );

    const checkin = await this.prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: memberId },
        data: {
          lastCheckinDate: today,
          continuousCheckinDays: continuousDays,
        },
      });
      return tx.memberCheckin.create({
        data: {
          memberId,
          checkinDate: today,
          rewardPoints,
          continuousDays,
          pointRecordId: pointRecord.id,
        },
      });
    });

    return {
      checkedIn: true,
      rewardPoints: checkin.rewardPoints,
      continuousDays: checkin.continuousDays,
      pointRecordId: checkin.pointRecordId,
      repeated: false,
    };
  }

  async getStatus(memberId: string, month: string, now = new Date()) {
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
    );
    const rows = await this.prisma.$transaction((tx) =>
      tx.memberCheckin.findMany({
        where: {
          memberId,
          checkinDate: { gte: start, lt: end },
        },
        orderBy: { checkinDate: 'asc' },
      }),
    );
    const todayKey = this.toDateKey(this.toDateOnly(now));
    const dates = rows.map((row: any) => this.toDateKey(row.checkinDate));
    return {
      checkedToday: dates.includes(todayKey),
      dates,
    };
  }

  private toDateOnly(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private toDateKey(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private isYesterday(previous: Date | null, today: Date) {
    if (!previous) {
      return false;
    }
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    return (
      this.toDateKey(this.toDateOnly(previous)) === this.toDateKey(yesterday)
    );
  }
}
