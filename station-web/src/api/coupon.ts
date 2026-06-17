import { http } from './http';

export type CouponScene = 'PICKUP' | 'SHIP' | 'ALL';
export type CouponTemplateStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export interface CouponTemplate {
  id: string;
  tenantId: string;
  name: string;
  type: 'DISCOUNT' | 'RATE' | 'EXEMPT';
  faceValue: number;
  threshold: number;
  scene: CouponScene;
  costPoints?: number | null;
  totalStock?: number | null;
  issuedCount: number;
  validDays: number;
  status: CouponTemplateStatus;
  createdAt: string;
}

export interface CouponTemplateQuery {
  scene?: CouponScene | '';
  status?: CouponTemplateStatus | '';
  page?: number;
  size?: number;
}

export interface CreateCouponTemplatePayload {
  name: string;
  type: 'DISCOUNT' | 'RATE' | 'EXEMPT';
  faceValue: number;
  threshold: number;
  scene: CouponScene;
  costPoints?: number;
  totalStock?: number;
  validDays: number;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  size: number;
}

export function toCouponTemplateQueryParams(query: CouponTemplateQuery) {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== ''),
  );
}

export function listCouponTemplatesApi(query: CouponTemplateQuery = {}) {
  return http.get<never, PageResult<CouponTemplate>>('/admin/coupon-templates', {
    params: toCouponTemplateQueryParams(query),
  });
}

export function createCouponTemplateApi(payload: CreateCouponTemplatePayload) {
  return http.post<never, CouponTemplate>('/admin/coupon-templates', payload);
}

export function issueCouponsApi(templateId: string, memberIds: string[]) {
  return http.post<never, number>(`/admin/coupon-templates/${templateId}/issue`, {
    memberIds,
  });
}

export function couponSceneMeta(scene: CouponScene) {
  const metas: Record<CouponScene, { label: string; tag: string }> = {
    ALL: { label: '全场景', tag: 'blue' },
    PICKUP: { label: '取件', tag: 'amber' },
    SHIP: { label: '寄件', tag: 'green' },
  };
  return metas[scene];
}
