import { describe, expect, it } from 'vitest';
import { ApiError, authHeader, unwrapResponse } from './request';

describe('user-app request helpers', () => {
  it('unwraps successful api response', () => {
    expect(unwrapResponse({ code: 0, message: 'ok', data: { pickToken: 't' } })).toEqual({
      pickToken: 't',
    });
  });

  it('throws api error for business failure', () => {
    expect(() => unwrapResponse({ code: 1002, message: '验证码错误', data: null })).toThrow(ApiError);
  });

  it('builds pick token authorization header', () => {
    expect(authHeader('abc')).toEqual({ Authorization: 'Bearer abc' });
    expect(authHeader('')).toEqual({});
  });
});
