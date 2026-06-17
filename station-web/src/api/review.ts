import { http } from './http';

export type ReviewStatus = 'PUBLISHED' | 'REPLIED' | 'HIDDEN';
export type ComplaintStatus = 'PENDING' | 'PROCESSING' | 'RESOLVED' | 'CLOSED';
export type ComplaintType = 'DAMAGE' | 'LOST' | 'SERVICE' | 'WRONG' | 'OTHER';

export interface ReviewItem {
  id: string;
  stationId: string;
  memberId: string;
  consumerPhone: string;
  targetType: 'PICKUP' | 'SHIP';
  refType: string;
  refId: string;
  rating: number;
  tags: string[];
  content?: string | null;
  status: ReviewStatus;
  replyContent?: string | null;
  createdAt: string;
}

export interface ComplaintItem {
  id: string;
  stationId: string;
  memberId: string;
  consumerPhone: string;
  type: ComplaintType;
  content: string;
  status: ComplaintStatus;
  handleNote?: string | null;
  createdAt: string;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  size: number;
}

export interface ReviewQuery {
  stationId?: string;
  status?: ReviewStatus | '';
  rating?: number;
  page?: number;
  size?: number;
}

export interface ComplaintQuery {
  stationId?: string;
  status?: ComplaintStatus | '';
  page?: number;
  size?: number;
}

export interface SatisfactionQuery {
  stationId?: string;
  from: string;
  to: string;
}

export interface SatisfactionSummary {
  avgRating: number;
  reviewCount: number;
  ratingDist: Record<1 | 2 | 3 | 4 | 5, number>;
  complaintCount: number;
  pickupCount: number;
  complaintRate: number;
  trend: Array<{ date: string; avgRating: number; reviewCount: number }>;
}

export function toReviewQueryParams(query: object) {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== ''),
  );
}

export function listReviewsApi(query: ReviewQuery) {
  return http.get<never, PageResult<ReviewItem>>('/admin/reviews', {
    params: toReviewQueryParams(query),
  });
}

export function replyReviewApi(id: string, content: string) {
  return http.post<never, ReviewItem>(`/admin/reviews/${id}/reply`, { content });
}

export function hideReviewApi(id: string, reason: string) {
  return http.post<never, ReviewItem>(`/admin/reviews/${id}/hide`, { reason });
}

export function listComplaintsApi(query: ComplaintQuery) {
  return http.get<never, PageResult<ComplaintItem>>('/admin/complaints', {
    params: toReviewQueryParams(query),
  });
}

export function handleComplaintApi(
  id: string,
  payload: { status: ComplaintStatus; note?: string },
) {
  return http.post<never, ComplaintItem>(`/admin/complaints/${id}/handle`, payload);
}

export function satisfactionSummaryApi(query: SatisfactionQuery) {
  return http.get<never, SatisfactionSummary>('/admin/satisfaction/summary', {
    params: toReviewQueryParams(query),
  });
}

export function reviewStatusMeta(status: ReviewStatus) {
  const metas: Record<ReviewStatus, { label: string; tag: string }> = {
    PUBLISHED: { label: '已发布', tag: 'blue' },
    REPLIED: { label: '已回复', tag: 'green' },
    HIDDEN: { label: '已隐藏', tag: 'gray' },
  };
  return metas[status];
}

export function complaintStatusMeta(status: ComplaintStatus) {
  const metas: Record<ComplaintStatus, { label: string; tag: string }> = {
    PENDING: { label: '待处理', tag: 'amber' },
    PROCESSING: { label: '处理中', tag: 'blue' },
    RESOLVED: { label: '已解决', tag: 'green' },
    CLOSED: { label: '已关闭', tag: 'gray' },
  };
  return metas[status];
}
