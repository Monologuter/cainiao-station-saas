import { ApiCode, BizError } from '../../core/http/api-code';

export type ExceptionStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

const TRANSITIONS: Record<ExceptionStatus, ExceptionStatus[]> = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: [],
};

export class ExceptionAggregate {
  static canTransit(from: ExceptionStatus, to: ExceptionStatus): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  static assertTransit(from: ExceptionStatus, to: ExceptionStatus): void {
    if (!this.canTransit(from, to)) {
      throw new BizError(
        ApiCode.ILLEGAL_TRANSITION,
        `异常工单状态不可从 ${from} 流转到 ${to}`,
      );
    }
  }
}
