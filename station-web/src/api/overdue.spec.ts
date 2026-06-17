import { describe, expect, it, vi } from 'vitest';
import { http } from './http';
import {
  listOverdueParcelsApi,
  runOverdueScanApi,
  toOverdueQueryParams,
} from './overdue';

describe('overdue api mapping', () => {
  it('drops empty filters and keeps backend query keys', () => {
    expect(toOverdueQueryParams({ level: '', page: 1, size: 20 })).toEqual({
      page: 1,
      size: 20,
    });
  });

  it('maps overdue list and scan endpoints', async () => {
    const get = vi.spyOn(http, 'get').mockResolvedValue({ list: [], total: 0 });
    const post = vi.spyOn(http, 'post').mockResolvedValue({ scanned: 0 });

    await listOverdueParcelsApi({ level: 2 });
    await runOverdueScanApi();

    expect(get).toHaveBeenCalledWith('/parcels/overdue', {
      params: { level: 2 },
    });
    expect(post).toHaveBeenCalledWith('/parcels/overdue/scan');
  });
});
