import { ApiCode, BizError } from '../../../core/http/api-code';

export type InvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'OVERDUE' | 'VOID';

const VOIDABLE: InvoiceStatus[] = ['OPEN', 'OVERDUE'];

export class InvoiceAggregate {
  static assertVoid(status: InvoiceStatus) {
    if (!VOIDABLE.includes(status)) {
      throw new BizError(ApiCode.ILLEGAL_TRANSITION, '账单状态不允许作废');
    }
  }
}
