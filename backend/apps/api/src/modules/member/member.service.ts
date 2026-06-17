import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ParcelStatus } from '@prisma/client';
import { ApiCode, BizError } from '../../core/http/api-code';
import { PrismaService } from '../../core/prisma/prisma.service';

const MOCK_CODE = '123456';
const CONSUMER_SCOPE = 'consumer:parcel-read';

export interface ConsumerTokenPayload {
  sub: string;
  phone: string;
  scope: string;
}

@Injectable()
export class MemberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  sendCode(phone: string) {
    return {
      sent: true,
      channel: 'mock-sms',
      expiresInSeconds: 300,
      phoneTail: phone.slice(-4),
    };
  }

  async verifyCode(phone: string, code: string) {
    if (code !== MOCK_CODE) {
      throw new BizError(ApiCode.UNAUTHORIZED, '验证码错误');
    }

    const consumerId = `phone:${phone}`;
    const pickToken = await this.jwt.signAsync(
      {
        sub: consumerId,
        phone,
        scope: CONSUMER_SCOPE,
      },
      { expiresIn: '7d' },
    );

    return { pickToken, consumerId };
  }

  async listParcels(authHeader?: string, status?: string) {
    const payload = await this.requireConsumer(authHeader);
    const where: { receiverPhone: string; status?: ParcelStatus } = {
      receiverPhone: payload.phone,
    };
    if (status) {
      where.status = this.parseStatus(status);
    }

    const parcels = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.parcel.findMany({
        where,
        include: {
          station: true,
          slot: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    return {
      list: parcels.map((parcel) => this.toConsumerParcel(parcel)),
      total: parcels.length,
      page: 1,
      size: parcels.length,
    };
  }

  async getParcel(authHeader: string | undefined, id: string) {
    const payload = await this.requireConsumer(authHeader);
    const parcel = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return tx.parcel.findFirst({
        where: { id, receiverPhone: payload.phone },
        include: {
          station: true,
          slot: true,
          events: { orderBy: { createdAt: 'asc' } },
        },
      });
    });

    if (!parcel) {
      throw new BizError(ApiCode.NOT_FOUND, '包裹不存在');
    }

    return this.toConsumerParcel(parcel);
  }

  async requireConsumer(authHeader?: string) {
    const token = this.extractBearer(authHeader);
    if (!token) {
      throw new BizError(ApiCode.UNAUTHORIZED, '缺少取件查询令牌');
    }

    try {
      const payload = await this.jwt.verifyAsync<ConsumerTokenPayload>(token);
      if (payload.scope !== CONSUMER_SCOPE || !payload.phone) {
        throw new Error('invalid consumer token');
      }
      return payload;
    } catch {
      throw new BizError(ApiCode.UNAUTHORIZED, '取件查询令牌无效');
    }
  }

  private extractBearer(authHeader?: string) {
    const match = authHeader?.match(/^Bearer\s+(.+)$/i);
    return match?.[1];
  }

  private parseStatus(status: string): ParcelStatus {
    if (
      status === 'PENDING' ||
      status === 'STORED' ||
      status === 'PICKED_UP' ||
      status === 'EXCEPTION' ||
      status === 'RETURNED'
    ) {
      return status;
    }
    throw new BizError(ApiCode.BAD_REQUEST, '包裹状态不支持');
  }

  private toConsumerParcel(parcel: any) {
    return {
      id: parcel.id,
      tenantId: parcel.tenantId,
      stationId: parcel.stationId,
      waybillNo: parcel.waybillNo,
      carrier: parcel.carrier,
      receiverPhoneTail: parcel.receiverPhoneTail,
      pickupCode: parcel.pickupCode,
      status: parcel.status,
      storedAt: parcel.storedAt,
      pickedUpAt: parcel.pickedUpAt,
      createdAt: parcel.createdAt,
      station: parcel.station
        ? {
            id: parcel.station.id,
            name: parcel.station.name,
            code: parcel.station.code,
          }
        : null,
      slot: parcel.slot
        ? {
            id: parcel.slot.id,
            code: parcel.slot.code,
          }
        : null,
      events: parcel.events?.map((event: any) => ({
        id: event.id,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        eventType: event.eventType,
        createdAt: event.createdAt,
      })),
    };
  }
}
