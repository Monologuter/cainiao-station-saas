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

  publishMetric(frame: MetricFrame) {
    this.frames.push({ type: 'metric:update', payload: frame });
  }

  publishParcelStored(payload: {
    tenantId: string;
    stationId: string;
    parcelId: string;
    pickupCode?: string;
    ts: string;
  }) {
    this.frames.push({ type: 'parcel:stored', payload });
  }
}
