import { Injectable, OnModuleInit } from '@nestjs/common';
import { DomainEvent, EventBus } from '../../../core/event-bus/event-bus';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MemberService } from '../member.service';
import { PointService } from '../point.service';

interface ParcelPickedUpPayload extends Record<string, unknown> {
  parcelId: string;
  tenantId: string;
  stationId?: string;
  consumerPhone?: string;
}

@Injectable()
export class ParcelPickedUpListener implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    private readonly prisma: PrismaService,
    private readonly members: MemberService,
    private readonly points: PointService,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe('ParcelPickedUp', (event) =>
      this.onParcelPickedUp(event as DomainEvent<ParcelPickedUpPayload>),
    );
  }

  async onParcelPickedUp(event: DomainEvent<ParcelPickedUpPayload>) {
    const phone =
      event.payload.consumerPhone ??
      (await this.withBypass((tx) =>
        tx.parcel
          .findUniqueOrThrow({ where: { id: event.payload.parcelId } })
          .then((parcel: any) => parcel.receiverPhone),
      ));
    const consumer: any = await this.consumerByPhone(phone);
    const member = await this.members.ensureMember(consumer.id, phone);

    await this.points.earn(member.id, 2, 'PICKUP', {
      sourceTenantId: event.payload.tenantId,
      refType: 'parcel',
      refId: event.payload.parcelId,
      idempotencyKey: `pickup:${event.payload.parcelId}`,
      remark: '取件积分',
    });
  }

  private consumerByPhone(phone: string) {
    return this.withBypass((tx) =>
      tx.consumer.upsert({
        where: { phone },
        update: {},
        create: { phone },
      }),
    );
  }

  private async withBypass<T>(fn: (tx: any) => Promise<T>) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.bypass_rls', 'on', true)`,
      );
      return fn(tx);
    });
  }
}
