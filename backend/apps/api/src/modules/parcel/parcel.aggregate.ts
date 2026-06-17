import { ApiCode, BizError } from '../../core/http/api-code';

export type ParcelStatus =
  | 'PENDING'
  | 'STORED'
  | 'PICKED_UP'
  | 'EXCEPTION'
  | 'RETURNED';

const TRANSITIONS: Record<ParcelStatus, ParcelStatus[]> = {
  PENDING: ['STORED', 'EXCEPTION'],
  STORED: ['PICKED_UP', 'EXCEPTION', 'RETURNED'],
  EXCEPTION: ['STORED', 'RETURNED'],
  PICKED_UP: [],
  RETURNED: [],
};

export class ParcelAggregate {
  static canTransit(from: ParcelStatus, to: ParcelStatus): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  static assertTransit(from: ParcelStatus, to: ParcelStatus): void {
    if (!this.canTransit(from, to)) {
      throw new BizError(
        ApiCode.ILLEGAL_TRANSITION,
        `包裹状态不可从 ${from} 流转到 ${to}`,
      );
    }
  }
}
