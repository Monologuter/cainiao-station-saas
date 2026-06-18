import { describe, expect, it, vi } from 'vitest';
import type { AxiosError } from 'axios';
import {
  ApiError,
  createResponseErrorHandler,
  unwrapApiResponse,
  type ApiResponse,
  type ResponseErrorDeps,
} from './http';

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

function makeError(overrides: Partial<AxiosError<ApiResponse<null>>> = {}) {
  return {
    response: { status: 401 },
    config: { url: '/parcels', headers: {} },
    ...overrides,
  } as AxiosError<ApiResponse<null>>;
}

function makeDeps(overrides: Partial<ResponseErrorDeps> = {}): ResponseErrorDeps {
  return {
    getRefreshToken: () => 'refresh-token',
    refresh: vi.fn(async () => 'new-access-token'),
    replay: vi.fn(async () => ({ ok: true })),
    onAuthFailure: vi.fn(),
    notify: vi.fn(),
    ...overrides,
  };
}

describe('http 401 refresh flow', () => {
  it('refreshes the access token and replays the original request once', async () => {
    const deps = makeDeps();
    const handler = createResponseErrorHandler(deps);
    const error = makeError();

    const result = await handler(error);

    expect(deps.refresh).toHaveBeenCalledWith('refresh-token');
    expect(deps.replay).toHaveBeenCalledTimes(1);
    // Replayed request carries the freshly minted access token.
    const replayedConfig = (deps.replay as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(replayedConfig.headers.Authorization).toBe('Bearer new-access-token');
    expect(replayedConfig._retried).toBe(true);
    expect(deps.onAuthFailure).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it('logs out when there is no refresh token', async () => {
    const deps = makeDeps({ getRefreshToken: () => null });
    const handler = createResponseErrorHandler(deps);

    await expect(handler(makeError())).rejects.toBeDefined();
    expect(deps.refresh).not.toHaveBeenCalled();
    expect(deps.onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it('does not retry a request that already attempted a refresh', async () => {
    const deps = makeDeps();
    const handler = createResponseErrorHandler(deps);
    const error = makeError({
      config: { url: '/parcels', headers: {}, _retried: true } as never,
    });

    await expect(handler(error)).rejects.toBeDefined();
    expect(deps.refresh).not.toHaveBeenCalled();
    expect(deps.onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it('logs out when the refresh request itself fails', async () => {
    const deps = makeDeps({
      refresh: vi.fn(async () => {
        throw new Error('refresh expired');
      }),
    });
    const handler = createResponseErrorHandler(deps);

    await expect(handler(makeError())).rejects.toBeDefined();
    expect(deps.replay).not.toHaveBeenCalled();
    expect(deps.onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it('does not attempt to refresh the refresh endpoint itself', async () => {
    const deps = makeDeps();
    const handler = createResponseErrorHandler(deps);
    const error = makeError({
      config: { url: '/auth/refresh', headers: {} } as never,
    });

    await expect(handler(error)).rejects.toBeDefined();
    expect(deps.refresh).not.toHaveBeenCalled();
    expect(deps.onAuthFailure).toHaveBeenCalledTimes(1);
  });

  it('surfaces a business message for non-401 errors', async () => {
    const deps = makeDeps();
    const handler = createResponseErrorHandler(deps);
    const error = makeError({
      response: { status: 400, data: { code: 1002, message: '参数错误', data: null } } as never,
    });

    await expect(handler(error)).rejects.toBeInstanceOf(ApiError);
    expect(deps.notify).toHaveBeenCalledWith('参数错误');
    expect(deps.onAuthFailure).not.toHaveBeenCalled();
  });
});
