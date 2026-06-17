import { ApiCode, BizError } from '../../../core/http/api-code';
import { assertApplicationTransition } from './application.state';

describe('application state', () => {
  it('allows pending applications to be approved or rejected', () => {
    expect(assertApplicationTransition('PENDING', 'approve')).toBe('APPROVED');
    expect(assertApplicationTransition('PENDING', 'reject')).toBe('REJECTED');
  });

  it('rejects repeated review for terminal applications', () => {
    expect(() =>
      assertApplicationTransition('APPROVED', 'approve'),
    ).toThrow(BizError);
    expect(() => assertApplicationTransition('REJECTED', 'reject')).toThrow(
      BizError,
    );

    try {
      assertApplicationTransition('APPROVED', 'reject');
    } catch (error) {
      expect(error).toBeInstanceOf(BizError);
      expect((error as BizError).code).toBe(ApiCode.ILLEGAL_TRANSITION);
      expect((error as Error).message).toContain('入驻申请状态不可流转');
    }
  });
});
