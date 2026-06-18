import { Injectable, OnModuleInit } from '@nestjs/common';
import { DomainEvent, EventBus } from '../../core/event-bus/event-bus';
import { SlotHeatService } from './slot-heat.service';

interface ParcelPickedUpPayload extends Record<string, unknown> {
  tenantId: string;
  parcelId: string;
}

@Injectable()
export class SlotHeatSubscriber implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    private readonly heat: SlotHeatService,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe('ParcelPickedUp', (event) =>
      this.onParcelPickedUp(event as DomainEvent<ParcelPickedUpPayload>),
    );
  }

  async onParcelPickedUp(event: DomainEvent<ParcelPickedUpPayload>) {
    await this.heat.recordPickedParcel({
      tenantId: event.payload.tenantId,
      parcelId: event.payload.parcelId,
    });
  }
}
