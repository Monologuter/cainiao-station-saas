export const PAY_CHANNEL = Symbol('PAY_CHANNEL');

export interface PayRequest {
  bizType: 'SHIP_ORDER';
  bizId: string;
  amount: number;
  idempotencyKey: string;
  subject: string;
}

export interface PayResult {
  status: 'SUCCESS' | 'FAILED';
  outTradeNo: string;
  paidAt?: Date;
  raw: unknown;
}

export interface PayChannel {
  readonly code: string;
  pay(req: PayRequest): Promise<PayResult>;
  verifyCallback?(payload: unknown): PayResult;
}
