import { request } from '@/utils/request';

export type ReviewTargetType = 'PICKUP' | 'SHIP';
export type ComplaintType = 'DAMAGE' | 'LOST' | 'SERVICE' | 'WRONG' | 'OTHER';
export type ComplaintStatus = 'PENDING' | 'PROCESSING' | 'RESOLVED' | 'CLOSED';

export interface PendingReviewTarget {
  targetType: ReviewTargetType;
  refId: string;
  stationName: string;
}

export interface SubmitReviewPayload {
  tenantId: string;
  stationId: string;
  targetType: ReviewTargetType;
  refType: string;
  refId: string;
  rating: number;
  tags?: string[];
  content?: string;
}

export interface SubmitComplaintPayload {
  tenantId: string;
  stationId: string;
  type: ComplaintType;
  content: string;
  refType?: string;
  refId?: string;
}

export interface ReviewItem extends SubmitReviewPayload {
  id: string;
  status: 'PUBLISHED' | 'REPLIED' | 'HIDDEN';
  replyContent?: string | null;
  createdAt: string;
}

export interface ComplaintItem extends SubmitComplaintPayload {
  id: string;
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

export function reviewRatingText(rating: number) {
  if (rating >= 5) return '非常满意';
  if (rating >= 4) return '满意';
  if (rating >= 3) return '一般';
  if (rating >= 2) return '需改进';
  return '不满意';
}

export function complaintStatusLabel(status: ComplaintStatus) {
  const labels: Record<ComplaintStatus, string> = {
    PENDING: '待处理',
    PROCESSING: '处理中',
    RESOLVED: '已解决',
    CLOSED: '已关闭',
  };
  return labels[status];
}

export function pendingReviewTargetLabel(target: PendingReviewTarget) {
  const type = target.targetType === 'PICKUP' ? '取件' : '寄件';
  return `${type} · ${target.stationName} · ${target.refId}`;
}

export function submitReviewApi(payload: SubmitReviewPayload) {
  return request<ReviewItem>({
    url: '/api/reviews',
    method: 'POST',
    data: payload,
  });
}

export function myReviewsApi() {
  return request<PageResult<ReviewItem>>({
    url: '/api/reviews/mine',
    method: 'GET',
  });
}

export function submitComplaintApi(payload: SubmitComplaintPayload) {
  return request<ComplaintItem>({
    url: '/api/complaints',
    method: 'POST',
    data: payload,
  });
}

export function myComplaintsApi() {
  return request<PageResult<ComplaintItem>>({
    url: '/api/complaints/mine',
    method: 'GET',
  });
}
