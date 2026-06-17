import { ApiCode, BizError } from '../../../core/http/api-code';

export type SubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'CANCELED'
  | 'EXPIRED';

const RENEWABLE: SubscriptionStatus[] = ['ACTIVE', 'PAST_DUE', 'SUSPENDED'];
const CANCELABLE: SubscriptionStatus[] = ['TRIALING', 'ACTIVE', 'PAST_DUE'];
const RESUMABLE: SubscriptionStatus[] = ['PAST_DUE', 'SUSPENDED'];

export class SubscriptionAggregate {
  static assertRenew(status: SubscriptionStatus) {
    if (!RENEWABLE.includes(status)) {
      throw new BizError(ApiCode.ILLEGAL_TRANSITION, '订阅状态不允许续费');
    }
  }

  static assertCancel(status: SubscriptionStatus) {
    if (!CANCELABLE.includes(status)) {
      throw new BizError(ApiCode.ILLEGAL_TRANSITION, '订阅状态不允许取消');
    }
  }

  static assertResume(status: SubscriptionStatus) {
    if (!RESUMABLE.includes(status)) {
      throw new BizError(ApiCode.ILLEGAL_TRANSITION, '订阅状态不允许恢复');
    }
  }
}
