import { Injectable } from '@nestjs/common';

export interface MetricFrame {
  tenantId: string;
  stationId: string;
  metric: string;
  value?: number | null;
  delta?: number;
  date: string;
}

@Injectable()
export class RealtimePublisher {
  readonly frames: Array<{ type: string; payload: unknown }> = [];
  private readonly sinks: Array<(type: string, payload: any) => void> = [];

  registerSink(sink: (type: string, payload: any) => void) {
    this.sinks.push(sink);
  }

  publishMetric(frame: MetricFrame) {
    this.publish('metric:update', frame);
  }

  publishParcelStored(payload: {
    tenantId: string;
    stationId: string;
    parcelId: string;
    pickupCode?: string;
    ts: string;
  }) {
    this.publish('parcel:stored', payload);
  }

  private publish(type: string, payload: unknown) {
    this.frames.push({ type, payload });
    for (const sink of this.sinks) {
      sink(type, payload);
    }
  }
}
