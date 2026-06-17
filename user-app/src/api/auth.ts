import { request } from '@/utils/request';

export interface VerifyResult {
  pickToken: string;
  consumerId: string;
}

export function sendCodeApi(phone: string) {
  return request<{ sent: boolean }>({
    url: '/api/consumer/auth/send-code',
    method: 'POST',
    data: { phone },
  });
}

export function verifyCodeApi(phone: string, code: string) {
  return request<VerifyResult>({
    url: '/api/consumer/auth/verify',
    method: 'POST',
    data: { phone, code },
  });
}
