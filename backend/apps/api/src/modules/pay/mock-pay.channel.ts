import { randomUUID } from 'node:crypto';
import { PayChannel, PayRequest, PayResult } from './pay-channel.interface';

export class MockPayChannel implements PayChannel {
  readonly code = 'mock';

  async pay(req: PayRequest): Promise<PayResult> {
    const paidAt = new Date();
    return {
      status: 'SUCCESS',
      outTradeNo: `MOCKPAY${Date.now()}${randomUUID().slice(0, 8)}`,
      paidAt,
      raw: {
        channel: this.code,
        bizType: req.bizType,
        bizId: req.bizId,
        amount: req.amount,
        paidAt: paidAt.toISOString(),
      },
    };
  }
}
