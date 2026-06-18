import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DomainEvent, EventBus } from '../../core/event-bus/event-bus';
import {
  APPLICATION_REJECTED_NOTIFY_JOB,
  NOTIFY_JOB_OPTIONS,
  NOTIFY_QUEUE,
  TENANT_APPROVED_NOTIFY_JOB,
  notifyJobId,
} from './notify-queue.constants';

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
    @Inject(NOTIFY_QUEUE) private readonly queue: Queue,
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
    await this.queue.add(TENANT_APPROVED_NOTIFY_JOB, event.payload, {
      ...NOTIFY_JOB_OPTIONS,
      jobId: notifyJobId(
        'tenant-approved',
        event.payload.tenantId,
        event.payload.applicationId,
      ),
    });
  }

  async onApplicationRejected(event: DomainEvent<ApplicationRejectedPayload>) {
    await this.queue.add(APPLICATION_REJECTED_NOTIFY_JOB, event.payload, {
      ...NOTIFY_JOB_OPTIONS,
      jobId: notifyJobId('application-rejected', event.payload.applicationId),
    });
  }
}
