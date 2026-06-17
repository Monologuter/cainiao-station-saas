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
    const now = Date.now();
    return [
      {
        nodeStatus: 'IN_TRANSIT',
        location: '杭州转运中心',
        description: '【运输中】快件离开始发城市',
        happenedAt: new Date(now + 60_000),
      },
      {
        nodeStatus: 'ARRIVED',
        location: '深圳转运中心',
        description: '【到达】快件已到达目的城市',
        happenedAt: new Date(now + 120_000),
      },
      {
        nodeStatus: 'OUT_FOR_DELIVERY',
        location: '深圳南山营业部',
        description: '【派送中】快件正在派送',
        happenedAt: new Date(now + 180_000),
      },
      {
        nodeStatus: 'DELIVERED',
        location: '深圳南山',
        description: '【签收】快件已签收',
        happenedAt: new Date(now + 240_000),
      },
    ];
  }
}
