import { Injectable, OnModuleInit } from '@nestjs/common';
import { DomainEvent, EventBus } from '../../../core/event-bus/event-bus';
import { MetricsService } from '../metrics.service';
import { RealtimePublisher } from '../realtime.publisher';

interface ParcelPayload extends Record<string, unknown> {
  tenantId: string;
  stationId: string;
  parcelId: string;
  slotId?: string | null;
  slotCode?: string | null;
  pickupCode?: string | null;
}

interface ShipOrderPayload extends Record<string, unknown> {
  tenantId: string;
  stationId?: string;
  shipOrderId: string;
  amount?: number;
}

@Injectable()
export class ParcelStoredAnalyticsListener implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    private readonly metrics: MetricsService,
    private readonly publisher: RealtimePublisher,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe('ParcelStored', (event) =>
      this.onParcelStored(event as DomainEvent<ParcelPayload>),
    );
  }

  async onParcelStored(event: DomainEvent<ParcelPayload>) {
    const payload = event.payload;
    const result = await this.metrics.incr({
      tenantId: payload.tenantId,
      stationId: payload.stationId,
      metric: 'inbound',
      by: 1,
      eventId: event.eventId,
      at: event.occurredAt,
    });
    if (result.skipped) return;

    const stored = await this.metrics.adjustStored({
      tenantId: payload.tenantId,
      stationId: payload.stationId,
      delta: 1,
    });
    await this.metrics.addOverdueCandidate({
      tenantId: payload.tenantId,
      stationId: payload.stationId,
      parcelId: payload.parcelId,
      at: event.occurredAt,
    });
    const shelfCode = this.shelfCode(payload.slotCode);
    if (shelfCode) {
      await this.metrics.adjustHeat({
        tenantId: payload.tenantId,
        stationId: payload.stationId,
        shelfCode,
        delta: 1,
      });
    }

    this.publisher.publishMetric({
      tenantId: payload.tenantId,
      stationId: payload.stationId,
      metric: 'inbound',
      value: result.value,
      delta: 1,
      date: this.toDateKey(event.occurredAt),
    });
    this.publisher.publishMetric({
      tenantId: payload.tenantId,
      stationId: payload.stationId,
      metric: 'stored',
      value: Number(stored),
      delta: 1,
      date: this.toDateKey(event.occurredAt),
    });
    this.publisher.publishParcelStored({
      tenantId: payload.tenantId,
      stationId: payload.stationId,
      parcelId: payload.parcelId,
      pickupCode: payload.pickupCode ?? undefined,
      ts: event.occurredAt.toISOString(),
    });
  }

  private shelfCode(slotCode?: string | null) {
    return slotCode?.split('-')[0] || null;
  }

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}

@Injectable()
export class ParcelLifecycleAnalyticsListener implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    private readonly metrics: MetricsService,
    private readonly publisher: RealtimePublisher,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe('ParcelPickedUp', (event) =>
      this.onParcelPickedUp(event as DomainEvent<ParcelPayload>),
    );
    this.eventBus.subscribe('ParcelReturned', (event) =>
      this.onParcelReturned(event as DomainEvent<ParcelPayload>),
    );
  }

  onParcelPickedUp(event: DomainEvent<ParcelPayload>) {
    return this.handleExit(event, 'pickup');
  }

  onParcelReturned(event: DomainEvent<ParcelPayload>) {
    return this.handleExit(event, 'returned');
  }

  private async handleExit(event: DomainEvent<ParcelPayload>, metric: string) {
    const payload = event.payload;
    const result = await this.metrics.incr({
      tenantId: payload.tenantId,
      stationId: payload.stationId,
      metric,
      by: 1,
      eventId: `${event.eventId}:${metric}`,
      at: event.occurredAt,
    });
    if (result.skipped) return;

    const stored = await this.metrics.adjustStored({
      tenantId: payload.tenantId,
      stationId: payload.stationId,
      delta: -1,
    });
    await this.metrics.removeOverdueCandidate({
      tenantId: payload.tenantId,
      stationId: payload.stationId,
      parcelId: payload.parcelId,
    });
    await this.metrics.adjustHeatBySlotId({
      tenantId: payload.tenantId,
      stationId: payload.stationId,
      slotId: payload.slotId,
      delta: -1,
    });
    this.publisher.publishMetric({
      tenantId: payload.tenantId,
      stationId: payload.stationId,
      metric,
      value: result.value,
      delta: 1,
      date: this.toDateKey(event.occurredAt),
    });
    this.publisher.publishMetric({
      tenantId: payload.tenantId,
      stationId: payload.stationId,
      metric: 'stored',
      value: Number(stored),
      delta: -1,
      date: this.toDateKey(event.occurredAt),
    });
  }

  private toDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }
}

@Injectable()
export class ShipOrderAnalyticsListener implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    private readonly metrics: MetricsService,
    private readonly publisher: RealtimePublisher,
  ) {}

  onModuleInit() {
    this.eventBus.subscribe('ShipOrderPaid', (event) =>
      this.onShipOrderPaid(event as DomainEvent<ShipOrderPayload>),
    );
  }

  async onShipOrderPaid(event: DomainEvent<ShipOrderPayload>) {
    const stationId = event.payload.stationId ?? 'unknown';
    await this.metrics.incr({
      tenantId: event.payload.tenantId,
      stationId,
      metric: 'ship_paid',
      by: 1,
      eventId: `${event.eventId}:ship_paid`,
      at: event.occurredAt,
    });
    await this.metrics.incr({
      tenantId: event.payload.tenantId,
      stationId,
      metric: 'ship_gmv',
      by: event.payload.amount ?? 0,
      eventId: `${event.eventId}:ship_gmv`,
      at: event.occurredAt,
    });
    this.publisher.publishMetric({
      tenantId: event.payload.tenantId,
      stationId,
      metric: 'ship_gmv',
      delta: event.payload.amount ?? 0,
      date: event.occurredAt.toISOString().slice(0, 10),
    });
  }
}
