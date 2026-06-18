import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DomainEvent, EventBus } from '../../core/event-bus/event-bus';
import {
  NOTIFY_JOB_OPTIONS,
  NOTIFY_QUEUE,
  PARCEL_STORED_NOTIFY_JOB,
  notifyJobId,
  type ParcelStoredNotifyJobData,
} from './notify-queue.constants';

interface ParcelStoredPayload extends Record<string, unknown> {
  parcelId: string;
  tenantId: string;
  stationId: string;
  stationName?: string;
  receiverPhone: string;
  pickupCode: string;
  slotCode?: string;
  consumerId?: string | null;
}

@Injectable()
export class ParcelStoredSubscriber implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    @Inject(NOTIFY_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe('ParcelStored', (event) =>
      this.onParcelStored(event as DomainEvent<ParcelStoredPayload>),
    );
  }

  /**
   * Hand the notification off to the BullMQ queue instead of sending inline.
   * Enqueue happens after the producing transaction has committed (the event is
   * published post-commit), so the worker never races ahead of the parcel write.
   * Actual delivery + idempotent persistence run in NotifyProcessor with retry.
   * A stable jobId keyed by parcelId makes redelivery of the same domain event
   * idempotent at the queue level too.
   */
  async onParcelStored(event: DomainEvent<ParcelStoredPayload>) {
    const payload = event.payload;
    const data: ParcelStoredNotifyJobData = {
      parcelId: payload.parcelId,
      tenantId: payload.tenantId,
      stationId: payload.stationId,
      stationName: payload.stationName,
      receiverPhone: payload.receiverPhone,
      pickupCode: payload.pickupCode,
      slotCode: payload.slotCode,
      consumerId: payload.consumerId,
    };
    await this.queue.add(PARCEL_STORED_NOTIFY_JOB, data, {
      ...NOTIFY_JOB_OPTIONS,
      jobId: notifyJobId('parcel-stored', payload.tenantId, payload.parcelId),
    });
  }
}
