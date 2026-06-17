import { request } from '@/utils/request';

export type PointRecordType =
  | 'PICKUP'
  | 'SHIP'
  | 'CHECKIN'
  | 'COUPON_REDEEM'
  | 'EXPIRE'
  | 'ADJUST'
  | 'REFUND';

export type CouponStatus = 'UNUSED' | 'USED' | 'EXPIRED' | 'FROZEN';
export type CouponScene = 'PICKUP' | 'SHIP' | 'ALL';

export interface MemberProfile {
  id: string;
  consumerId: string;
  phone: string;
  level: number;
  totalPoints: number;
  availablePoints: number;
  continuousCheckinDays: number;
  nextLevel: number | null;
  nextLevelNeed: number;
  progressPercent: number;
}

export interface PointRecord {
  id: string;
  change: number;
  balanceAfter: number;
  type: PointRecordType;
  remark?: string | null;
  createdAt: string;
}

export interface PointRecordQuery {
  type?: PointRecordType | '';
  page?: number;
  size?: number;
}

export interface CouponTemplateQuery {
  tenantId?: string;
  scene?: CouponScene | '';
}

export interface CouponTemplate {
  id: string;
  tenantId: string;
  name: string;
  type: 'DISCOUNT' | 'RATE' | 'EXEMPT';
  faceValue: number;
  threshold: number;
  scene: CouponScene;
  costPoints?: number | null;
  validDays: number;
}

export interface Coupon {
  id: string;
  tenantId: string;
  templateId: string;
  code: string;
  status: CouponStatus;
  expireAt: string;
  template?: CouponTemplate;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  size: number;
}

export interface CheckinResult {
  id?: string;
  checkedToday: boolean;
  rewardPoints: number;
  continuousDays: number;
  checkinDate: string;
}

export interface CheckinStatus {
  checkedToday: boolean;
  dates: string[];
}

export function pointRecordQuery(query: PointRecordQuery) {
  const params = new URLSearchParams();
  if (query.type) params.set('type', query.type);
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.size !== undefined) params.set('size', String(query.size));
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function templateQuery(query: CouponTemplateQuery) {
  const params = new URLSearchParams();
  if (query.tenantId) params.set('tenantId', query.tenantId);
  if (query.scene) params.set('scene', query.scene);
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function redeemCouponPayload(templateId: string) {
  return { templateId };
}

export function couponStatusLabel(status: CouponStatus) {
  const labels: Record<CouponStatus, string> = {
    UNUSED: '可使用',
    USED: '已使用',
    EXPIRED: '已过期',
    FROZEN: '已冻结',
  };
  return labels[status];
}

export function pointTypeLabel(type: PointRecordType) {
  const labels: Record<PointRecordType, string> = {
    PICKUP: '取件奖励',
    SHIP: '寄件奖励',
    CHECKIN: '签到',
    COUPON_REDEEM: '兑换券',
    EXPIRE: '过期',
    ADJUST: '调整',
    REFUND: '退回',
  };
  return labels[type];
}

export function checkinRewardLabel(points: number, days: number) {
  return `连签 ${days} 天，本次 +${points} 积分`;
}

export function memberProfileApi() {
  return request<MemberProfile>({ url: '/api/member/profile', method: 'GET' });
}

export function pointRecordsApi(query: PointRecordQuery = {}) {
  return request<PageResult<PointRecord>>({
    url: `/api/member/points/records${pointRecordQuery(query)}`,
    method: 'GET',
  });
}

export function checkinApi() {
  return request<CheckinResult>({ url: '/api/member/checkin', method: 'POST' });
}

export function checkinStatusApi(month: string) {
  return request<CheckinStatus>({
    url: `/api/member/checkin/status?month=${month}`,
    method: 'GET',
  });
}

export function couponsApi(status?: CouponStatus | '') {
  const query = status ? `?status=${status}` : '';
  return request<PageResult<Coupon>>({
    url: `/api/member/coupons${query}`,
    method: 'GET',
  });
}

export function couponTemplatesApi(query: CouponTemplateQuery = {}) {
  return request<PageResult<CouponTemplate>>({
    url: `/api/member/coupon-templates${templateQuery(query)}`,
    method: 'GET',
  });
}

export function redeemCouponApi(templateId: string) {
  return request<Coupon>({
    url: '/api/member/coupons/redeem',
    method: 'POST',
    data: redeemCouponPayload(templateId),
  });
}
