export const LOGISTICS_PROVIDER = Symbol('LOGISTICS_PROVIDER');

export interface CreateWaybillRequest {
  shipOrderId: string;
  courierCode: string;
  sender: unknown;
  receiver: unknown;
  weightGram: number;
}

export interface CreateWaybillResult {
  waybillNo: string;
}

export interface TrackNode {
  nodeStatus:
    | 'COLLECTED'
    | 'IN_TRANSIT'
    | 'ARRIVED'
    | 'OUT_FOR_DELIVERY'
    | 'DELIVERED';
  location: string;
  description: string;
  happenedAt: Date;
}

export interface LogisticsProvider {
  readonly code: string;
  createWaybill(req: CreateWaybillRequest): Promise<CreateWaybillResult>;
  pollTracks(waybillNo: string): Promise<TrackNode[]>;
  verifyCallback?(input: { payload: string; sign: string }): boolean;
  parseCallbackTracks?(payload: string): TrackNode[];
}
