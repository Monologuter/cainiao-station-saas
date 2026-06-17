import { ApiCode, BizError } from '../../../core/http/api-code';

export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ApplicationAction = 'approve' | 'reject';

const TRANSITIONS: Record<
  ApplicationStatus,
  Partial<Record<ApplicationAction, ApplicationStatus>>
> = {
  PENDING: {
    approve: 'APPROVED',
    reject: 'REJECTED',
  },
  APPROVED: {},
  REJECTED: {},
};

export function assertApplicationTransition(
  status: ApplicationStatus,
  action: ApplicationAction,
) {
  const next = TRANSITIONS[status]?.[action];
  if (!next) {
    throw new BizError(ApiCode.ILLEGAL_TRANSITION, '入驻申请状态不可流转');
  }
  return next;
}
