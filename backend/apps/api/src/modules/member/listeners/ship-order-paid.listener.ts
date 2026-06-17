import { Injectable, OnModuleInit } from '@nestjs/common';
import { DomainEvent, EventBus } from '../../../core/event-bus/event-bus';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MemberService } from '../member.service';
import { PointService } from '../point.service';

interface ShipOrderPaidPayload extends Record<string, unknown> {
  shipOrderId: string;
  tenantId: string;
  amount: number;
  consumerPhone?: string;
}

@Injectable()
export class ShipOrderPaidListener implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    private readonly prisma: PrismaService,
    private readonly members: MemberService,
    private readonly points: PointService,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe('ShipOrderPaid', (event) =>
      this.onShipOrderPaid(event as DomainEvent<ShipOrderPaidPayload>),
    );
  }

  async onShipOrderPaid(event: DomainEvent<ShipOrderPaidPayload>) {
    const order: any = await this.withBypass((tx) =>
      tx.shipOrder.findUniqueOrThrow({
        where: { id: event.payload.shipOrderId },
      }),
    );
    if (!order.consumerId) {
      return;
    }

    const consumer: any = await this.withBypass((tx) =>
      tx.consumer.findUniqueOrThrow({ where: { id: order.consumerId } }),
    );
    const member = await this.members.ensureMember(consumer.id, consumer.phone);
    const points = Math.max(
      1,
      Math.floor((event.payload.amount ?? order.quoteAmount) / 100),
    );

    await this.points.earn(member.id, points, 'SHIP', {
      sourceTenantId: event.payload.tenantId,
      refType: 'ship_order',
      refId: event.payload.shipOrderId,
      idempotencyKey: `ship:${event.payload.shipOrderId}`,
      remark: '寄件积分',
    });
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
