import { describe, expect, it, vi } from 'vitest';
import { http } from './http';
import {
  claimExceptionApi,
  createParcelExceptionApi,
  listExceptionsApi,
  resolveExceptionApi,
  toExceptionQueryParams,
} from './exceptions';

describe('exceptions api mapping', () => {
  it('drops empty filters and keeps backend query keys', () => {
    expect(
      toExceptionQueryParams({
        status: 'OPEN',
        type: '',
        keyword: 'YT001',
        page: 2,
        size: 20,
      }),
    ).toEqual({ status: 'OPEN', keyword: 'YT001', page: 2, size: 20 });
  });

  it('maps exception endpoints', async () => {
    const post = vi.spyOn(http, 'post').mockResolvedValue({ id: 'ex1' });
    const get = vi.spyOn(http, 'get').mockResolvedValue({ list: [], total: 0 });

    await createParcelExceptionApi('p1', {
      type: 'DAMAGED',
      description: '破损',
    });
    await listExceptionsApi({ status: 'OPEN' });
    await claimExceptionApi('ex1');
    await resolveExceptionApi('ex1', { resolution: 'RESTOCK', note: '归位' });

    expect(post).toHaveBeenCalledWith('/parcels/p1/exception', {
      type: 'DAMAGED',
      description: '破损',
    });
    expect(get).toHaveBeenCalledWith('/exceptions', {
      params: { status: 'OPEN' },
    });
    expect(post).toHaveBeenCalledWith('/exceptions/ex1/claim');
    expect(post).toHaveBeenCalledWith('/exceptions/ex1/resolve', {
      resolution: 'RESTOCK',
      note: '归位',
    });
  });
});
