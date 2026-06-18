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
// 换套餐仅允许处于"在用"生命周期内的订阅：TRIALING/ACTIVE。
// PAST_DUE/SUSPENDED 处于欠费/停用过渡态，CANCELED/EXPIRED 为终态，均不允许换套餐。
const CHANGEABLE: SubscriptionStatus[] = ['TRIALING', 'ACTIVE'];

export class SubscriptionAggregate {
  static assertRenew(status: SubscriptionStatus) {
    if (!RENEWABLE.includes(status)) {
      throw new BizError(ApiCode.ILLEGAL_TRANSITION, '订阅状态不允许续费');
    }
  }

  static assertChangePlan(status: SubscriptionStatus) {
    if (!CHANGEABLE.includes(status)) {
      throw new BizError(ApiCode.ILLEGAL_TRANSITION, '订阅状态不允许换套餐');
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
