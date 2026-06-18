import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DomainEvent, EventBus } from '../../core/event-bus/event-bus';
import {
  NOTIFY_JOB_OPTIONS,
  NOTIFY_QUEUE,
  PARCEL_OVERDUE_NOTIFY_JOB,
  notifyJobId,
} from './notify-queue.constants';

interface ParcelOverduePayload extends Record<string, unknown> {
  parcelId: string;
  tenantId: string;
  stationId: string;
  stationName?: string;
  receiverPhone: string;
  pickupCode?: string | null;
  slotCode?: string | null;
  consumerId?: string | null;
  level: 1 | 2 | 3;
  daysOverdue: number;
}

@Injectable()
export class OverdueSubscriber implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    @Inject(NOTIFY_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe('ParcelOverdueDetected', (event) =>
      this.onParcelOverdue(event as DomainEvent<ParcelOverduePayload>),
    );
  }

  async onParcelOverdue(event: DomainEvent<ParcelOverduePayload>) {
    await this.queue.add(PARCEL_OVERDUE_NOTIFY_JOB, event.payload, {
      ...NOTIFY_JOB_OPTIONS,
      jobId: notifyJobId(
        'parcel-overdue',
        event.payload.tenantId,
        event.payload.parcelId,
        event.payload.level,
      ),
    });
  }
}
