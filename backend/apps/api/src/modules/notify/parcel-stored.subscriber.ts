import { Injectable, OnModuleInit } from '@nestjs/common';
import { DomainEvent, EventBus } from '../../core/event-bus/event-bus';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { NotifyService } from './notify.service';

interface ParcelStoredPayload extends Record<string, unknown> {
  parcelId: string;
  tenantId: string;
  stationId: string;
  receiverPhone: string;
  pickupCode: string;
  slotCode?: string;
}

@Injectable()
export class ParcelStoredSubscriber implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    private readonly notify: NotifyService,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe('ParcelStored', (event) =>
      this.onParcelStored(event as DomainEvent<ParcelStoredPayload>),
    );
  }

  async onParcelStored(event: DomainEvent<ParcelStoredPayload>) {
    await TenantContext.run(
      {
        userId: 'system',
        tenantId: event.payload.tenantId,
        roles: [],
        isPlatform: false,
      },
      () => this.notify.notifyParcelStored(event.payload),
    );
  }
}
