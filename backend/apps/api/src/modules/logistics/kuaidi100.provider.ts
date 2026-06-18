import { createHash, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  CreateWaybillRequest,
  CreateWaybillResult,
  LogisticsProvider,
  TrackNode,
} from './logistics-provider.interface';

export interface KuaiDi100Client {
  queryTrack(input: {
    customer: string;
    key: string;
    com?: string;
    num: string;
  }): Promise<{ data?: KuaiDi100TrackItem[] }>;
}

interface KuaiDi100TrackItem {
  status?: string;
  context?: string;
  time?: string;
  areaName?: string;
}

interface KuaiDi100Options {
  key?: string;
  customer?: string;
}

export const KUAIDI100_CLIENT = Symbol('KUAIDI100_CLIENT');
export const KUAIDI100_OPTIONS = Symbol('KUAIDI100_OPTIONS');

@Injectable()
export class KuaiDi100Provider implements LogisticsProvider {
  readonly code = 'kuaidi100';
  private readonly client: KuaiDi100Client;
  private readonly options: KuaiDi100Options;

  constructor(
    @Optional()
    @Inject(KUAIDI100_CLIENT)
    client?: KuaiDi100Client,
    @Optional()
    @Inject(KUAIDI100_OPTIONS)
    options?: KuaiDi100Options,
  ) {
    this.client = client ?? new MissingKuaiDi100Client();
    this.options = options ?? {
      key: process.env.KUAIDI100_KEY,
      customer: process.env.KUAIDI100_CUSTOMER,
    };
  }

  async createWaybill(req: CreateWaybillRequest): Promise<CreateWaybillResult> {
    return { waybillNo: `K100-${req.shipOrderId}` };
  }

  async pollTracks(waybillNo: string): Promise<TrackNode[]> {
    const response = await this.client.queryTrack({
      customer: this.options.customer ?? '',
      key: this.options.key ?? '',
      num: waybillNo,
    });
    return (response.data ?? []).map((item) => this.toTrackNode(item));
  }

  verifyCallback(input: { payload: string; sign: string }) {
    return this.safeEqual(this.sign(input.payload), input.sign);
  }

  parseCallbackTracks(payload: string) {
    const body = JSON.parse(payload) as { data?: KuaiDi100TrackItem[] };
    return (body.data ?? []).map((item) => this.toTrackNode(item));
  }

  sign(payload: string) {
    return createHash('md5')
      .update(
        `${payload}${this.options.key ?? ''}${this.options.customer ?? ''}`,
      )
      .digest('hex')
      .toUpperCase();
  }

  private toTrackNode(item: KuaiDi100TrackItem): TrackNode {
    return {
      nodeStatus: this.mapStatus(item.status, item.context),
      location: item.areaName ?? '',
      description: item.context ?? '',
      happenedAt: this.parseTime(item.time),
    };
  }

  private mapStatus(
    status?: string,
    context?: string,
  ): TrackNode['nodeStatus'] {
    const value = `${status ?? ''} ${context ?? ''}`;
    if (value.includes('签收')) return 'DELIVERED';
    if (value.includes('派送')) return 'OUT_FOR_DELIVERY';
    if (value.includes('到达')) return 'ARRIVED';
    if (value.includes('揽收')) return 'COLLECTED';
    return 'IN_TRANSIT';
  }

  private parseTime(value?: string) {
    if (!value) {
      return new Date();
    }
    return new Date(`${value.replace(' ', 'T')}.000+08:00`);
  }

  private safeEqual(expected: string, actual: string) {
    const left = Buffer.from(expected);
    const right = Buffer.from(actual);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}

class MissingKuaiDi100Client implements KuaiDi100Client {
  async queryTrack() {
    return { data: [] };
  }
}
