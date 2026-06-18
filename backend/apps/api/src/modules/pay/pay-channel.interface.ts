export const PAY_CHANNEL = Symbol('PAY_CHANNEL');

export interface PayRequest {
  bizType: 'SHIP_ORDER' | 'SUBSCRIPTION_INVOICE';
  bizId: string;
  amount: number;
  idempotencyKey: string;
  subject: string;
}

export interface RefundRequest {
  outTradeNo: string;
  refundNo: string;
  amount: number;
  refundAmount: number;
  reason: string;
}

export interface RefundResult {
  status: 'SUCCESS' | 'FAILED';
  refundNo: string;
  raw: unknown;
}

export interface ReconcilePayment {
  outTradeNo: string;
  amount: number;
  status: string;
}

export interface ReconcileStatementRow {
  outTradeNo: string;
  amount: number;
  status: string;
}

export interface ReconcileDifference {
  outTradeNo: string;
  type:
    | 'MISSING_IN_PROVIDER'
    | 'MISSING_IN_SYSTEM'
    | 'AMOUNT_MISMATCH'
    | 'STATUS_MISMATCH';
  system?: ReconcilePayment;
  provider?: ReconcileStatementRow;
}

export interface PayResult {
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  outTradeNo: string;
  paidAt?: Date;
  raw: unknown;
}

export interface PayChannel {
  readonly code: string;
  pay(req: PayRequest): Promise<PayResult>;
  verifyCallback?(payload: unknown): PayResult;
  refund?(req: RefundRequest): Promise<RefundResult>;
  reconcile?(
    systemPayments: ReconcilePayment[],
    providerRows: ReconcileStatementRow[],
  ): ReconcileDifference[];
}
