import { Injectable, OnModuleInit } from '@nestjs/common';
import { DomainEvent, EventBus } from '../../core/event-bus/event-bus';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { NotifyService } from './notify.service';

interface ParcelOverduePayload extends Record<string, unknown> {
  parcelId: string;
  tenantId: string;
  stationId: string;
  stationName?: string;
  receiverPhone: string;
  pickupCode?: string | null;
  slotCode?: string | null;
  level: 1 | 2 | 3;
  daysOverdue: number;
}

@Injectable()
export class OverdueSubscriber implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    private readonly notify: NotifyService,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe('ParcelOverdueDetected', (event) =>
      this.onParcelOverdue(event as DomainEvent<ParcelOverduePayload>),
    );
  }

  async onParcelOverdue(event: DomainEvent<ParcelOverduePayload>) {
    await TenantContext.run(
      {
        userId: 'system',
        tenantId: event.payload.tenantId,
        roles: [],
        isPlatform: false,
      },
      () => this.notify.notifyParcelOverdue(event.payload),
    );
  }
}
