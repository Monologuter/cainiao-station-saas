import { randomUUID } from 'node:crypto';
import {
  CreateWaybillRequest,
  CreateWaybillResult,
  LogisticsProvider,
  TrackNode,
} from './logistics-provider.interface';

export class MockLogisticsProvider implements LogisticsProvider {
  readonly code = 'mock';

  async createWaybill(
    _req: CreateWaybillRequest,
  ): Promise<CreateWaybillResult> {
    return {
      waybillNo: `MOCK${Date.now()}${randomUUID().slice(0, 8).toUpperCase()}`,
    };
  }

  async pollTracks(_waybillNo: string): Promise<TrackNode[]> {
    return [];
  }
}
