import { Injectable, OnModuleInit } from '@nestjs/common';
import { DomainEvent, EventBus } from '../../../../core/event-bus/event-bus';
import { ApiCode, BizError } from '../../../../core/http/api-code';
import { TenantContext } from '../../../../core/tenant-context/tenant-context';
import { UsageService } from '../usage.service';

interface ParcelStoredPayload extends Record<string, unknown> {
  tenantId: string;
  stationId: string;
}

@Injectable()
export class ParcelUsageSubscriber implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    private readonly usage: UsageService,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe('ParcelStored', (event) =>
      this.onParcelStored(event as DomainEvent<ParcelStoredPayload>),
    );
  }

  async onParcelStored(event: DomainEvent<ParcelStoredPayload>) {
    try {
      await TenantContext.run(
        {
          userId: 'system',
          tenantId: event.payload.tenantId,
          roles: [],
          isPlatform: false,
        },
        () =>
          this.usage.meter({
            tenantId: event.payload.tenantId,
            stationId: event.payload.stationId,
            eventId: event.eventId,
            metric: 'PARCELS',
            quantity: 1,
            eventAt: event.occurredAt,
          }),
      );
    } catch (error) {
      if (error instanceof BizError && error.code === ApiCode.NOT_FOUND) {
        return;
      }
      throw error;
    }
  }
}
