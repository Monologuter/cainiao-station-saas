import { Injectable, OnModuleInit } from '@nestjs/common';
import { DomainEvent, EventBus } from '../../../../core/event-bus/event-bus';
import { ApiCode, BizError } from '../../../../core/http/api-code';
import { TenantContext } from '../../../../core/tenant-context/tenant-context';
import { UsageService } from '../usage.service';

interface StationCreatedPayload extends Record<string, unknown> {
  tenantId: string;
  stationId: string;
}

@Injectable()
export class StationUsageSubscriber implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    private readonly usage: UsageService,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe('StationCreated', (event) =>
      this.onStationCreated(event as DomainEvent<StationCreatedPayload>),
    );
  }

  async onStationCreated(event: DomainEvent<StationCreatedPayload>) {
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
            eventId: event.eventId,
            metric: 'EXTRA_STATIONS',
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
