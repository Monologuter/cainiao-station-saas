import { ApiCode, BizError } from '../../core/http/api-code';

export type ShipOrderStatus =
  | 'CREATED'
  | 'PAID'
  | 'COLLECTED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED';

const TRANSITIONS: Record<ShipOrderStatus, ShipOrderStatus[]> = {
  CREATED: ['PAID', 'CANCELLED'],
  PAID: ['COLLECTED', 'CANCELLED'],
  COLLECTED: ['IN_TRANSIT'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export class ShipOrderAggregate {
  static canTransit(from: ShipOrderStatus, to: ShipOrderStatus): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  static assertTransit(from: ShipOrderStatus, to: ShipOrderStatus): void {
    if (!this.canTransit(from, to)) {
      throw new BizError(
        ApiCode.SHIPPING_ILLEGAL_TRANSITION,
        `寄件订单状态不可从 ${from} 流转到 ${to}`,
      );
    }
  }
}
