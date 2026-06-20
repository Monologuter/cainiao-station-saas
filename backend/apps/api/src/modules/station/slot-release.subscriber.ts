import { Injectable, OnModuleInit } from '@nestjs/common';
import { DomainEvent, EventBus } from '../../core/event-bus/event-bus';
import { SlotAllocatorService } from './slot-allocator.service';

interface SlotReleasePayload extends Record<string, unknown> {
  parcelId: string;
  slotId?: string | null;
}

@Injectable()
export class SlotReleaseSubscriber implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    private readonly allocator: SlotAllocatorService,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe('ParcelPickedUp', (event) =>
      this.onParcelPickedUp(event as DomainEvent<SlotReleasePayload>),
    );
    this.eventBus.subscribe('ParcelReturned', (event) =>
      this.onParcelReturned(event as DomainEvent<SlotReleasePayload>),
    );
    this.eventBus.subscribe('ParcelMarkedException', (event) =>
      this.onParcelMarkedException(event as DomainEvent<SlotReleasePayload>),
    );
  }

  async onParcelPickedUp(event: DomainEvent<SlotReleasePayload>) {
    await this.releaseFromEvent(event);
  }

  async onParcelReturned(event: DomainEvent<SlotReleasePayload>) {
    await this.releaseFromEvent(event);
  }

  async onParcelMarkedException(event: DomainEvent<SlotReleasePayload>) {
    await this.releaseFromEvent(event);
  }

  private async releaseFromEvent(event: DomainEvent<SlotReleasePayload>) {
    const { slotId, parcelId } = event.payload;
    if (!slotId) return;
    await this.allocator.release(slotId, parcelId);
  }
}
