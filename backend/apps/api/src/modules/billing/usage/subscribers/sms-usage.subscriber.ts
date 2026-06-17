import { Injectable, OnModuleInit } from '@nestjs/common';
import { DomainEvent, EventBus } from '../../../../core/event-bus/event-bus';
import { ApiCode, BizError } from '../../../../core/http/api-code';
import { TenantContext } from '../../../../core/tenant-context/tenant-context';
import { UsageService } from '../usage.service';

interface SmsNotificationSentPayload extends Record<string, unknown> {
  tenantId: string;
  stationId?: string;
  usageEventId: string;
  sentAt?: string;
}

@Injectable()
export class SmsUsageSubscriber implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    private readonly usage: UsageService,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe('SmsNotificationSent', (event) =>
      this.onSmsNotificationSent(
        event as DomainEvent<SmsNotificationSentPayload>,
      ),
    );
  }

  async onSmsNotificationSent(event: DomainEvent<SmsNotificationSentPayload>) {
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
            eventId: event.payload.usageEventId,
            metric: 'SMS',
            quantity: 1,
            eventAt: event.payload.sentAt
              ? new Date(event.payload.sentAt)
              : event.occurredAt,
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
