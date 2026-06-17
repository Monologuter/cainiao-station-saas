import { Injectable, OnModuleInit } from '@nestjs/common';
import { DomainEvent, EventBus } from '../../core/event-bus/event-bus';
import { TenantContext } from '../../core/tenant-context/tenant-context';
import { NotifyService } from './notify.service';

interface TenantApprovedPayload extends Record<string, unknown> {
  applicationId: string;
  tenantId: string;
  stationId?: string;
  ownerUserId: string;
  ownerUsername: string;
  tempPassword?: string;
  planCode: string;
}

interface ApplicationRejectedPayload extends Record<string, unknown> {
  applicationId: string;
  contactPhone: string;
  rejectReason: string;
}

@Injectable()
export class OnboardingSubscriber implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    private readonly notify: NotifyService,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe('TenantApproved', (event) =>
      this.onTenantApproved(event as DomainEvent<TenantApprovedPayload>),
    );
    this.eventBus.subscribe('ApplicationRejected', (event) =>
      this.onApplicationRejected(
        event as DomainEvent<ApplicationRejectedPayload>,
      ),
    );
  }

  async onTenantApproved(event: DomainEvent<TenantApprovedPayload>) {
    await TenantContext.run(
      {
        userId: 'system',
        tenantId: event.payload.tenantId,
        roles: [],
        isPlatform: false,
      },
      () => this.notify.notifyTenantApproved(event.payload),
    );
  }

  async onApplicationRejected(event: DomainEvent<ApplicationRejectedPayload>) {
    await TenantContext.run(
      {
        userId: 'system',
        tenantId: null,
        roles: [],
        isPlatform: true,
      },
      () => this.notify.notifyApplicationRejected(event.payload),
    );
  }
}
