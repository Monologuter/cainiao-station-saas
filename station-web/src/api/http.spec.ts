import { describe, expect, it } from 'vitest';
import { ApiError, unwrapApiResponse } from './http';

describe('http response unwrap', () => {
  it('returns data when backend business code is ok', () => {
    expect(
      unwrapApiResponse({
        code: 0,
        message: 'ok',
        data: { accessToken: 'token' },
      }),
    ).toEqual({ accessToken: 'token' });
  });

  it('throws ApiError for non-zero business code', () => {
    expect(() =>
      unwrapApiResponse({
        code: 1002,
        message: '账号或密码错误',
        data: null,
      }),
    ).toThrow(ApiError);
  });
});
