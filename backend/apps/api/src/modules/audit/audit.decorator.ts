import { SetMetadata } from '@nestjs/common';

export const AUDIT_METADATA = 'audit:options';

export type AuditOptions = {
  action: string;
  resourceType: string;
  summary?: string | ((payload: AuditPayload) => string);
};

export type AuditPayload = {
  request: any;
  response?: unknown;
  error?: unknown;
};

export const Audit = (options: AuditOptions) =>
  SetMetadata(AUDIT_METADATA, options);
