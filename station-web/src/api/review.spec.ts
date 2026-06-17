import { describe, expect, it, vi } from 'vitest';
import { http } from './http';
import {
  complaintStatusMeta,
  handleComplaintApi,
  listComplaintsApi,
  listReviewsApi,
  replyReviewApi,
  reviewStatusMeta,
  satisfactionSummaryApi,
  toReviewQueryParams,
} from './review';

describe('review api mapping', () => {
  it('drops empty review filters and keeps backend keys', () => {
    expect(
      toReviewQueryParams({
        stationId: 's1',
        status: '',
        rating: undefined,
        page: 1,
        size: 20,
      }),
    ).toEqual({ stationId: 's1', page: 1, size: 20 });
  });

  it('maps review and complaint endpoints', async () => {
    const get = vi.spyOn(http, 'get').mockResolvedValue({ list: [], total: 0 });
    const post = vi.spyOn(http, 'post').mockResolvedValue({ id: 'r1' });

    await listReviewsApi({ status: 'PUBLISHED' });
    await replyReviewApi('r1', '感谢认可');
    await listComplaintsApi({ status: 'PENDING' });
    await handleComplaintApi('c1', { status: 'PROCESSING', note: '已受理' });
    await satisfactionSummaryApi({ stationId: 's1', from: '2026-01-01', to: '2026-12-31' });

    expect(get).toHaveBeenCalledWith('/admin/reviews', {
      params: { status: 'PUBLISHED' },
    });
    expect(post).toHaveBeenCalledWith('/admin/reviews/r1/reply', {
      content: '感谢认可',
    });
    expect(get).toHaveBeenCalledWith('/admin/complaints', {
      params: { status: 'PENDING' },
    });
    expect(post).toHaveBeenCalledWith('/admin/complaints/c1/handle', {
      status: 'PROCESSING',
      note: '已受理',
    });
    expect(get).toHaveBeenCalledWith('/admin/satisfaction/summary', {
      params: { stationId: 's1', from: '2026-01-01', to: '2026-12-31' },
    });
  });

  it('maps review and complaint statuses to tag semantics', () => {
    expect(reviewStatusMeta('PUBLISHED')).toEqual({ label: '已发布', tag: 'blue' });
    expect(reviewStatusMeta('REPLIED')).toEqual({ label: '已回复', tag: 'green' });
    expect(complaintStatusMeta('PROCESSING')).toEqual({ label: '处理中', tag: 'blue' });
  });
});
