import type { JobsOptions } from 'bullmq';

export const NOTIFY_QUEUE_NAME = 'notify';
export const NOTIFY_QUEUE = Symbol('NOTIFY_QUEUE');

/** Job names for domain-event -> notification delivery work items. */
export const PARCEL_STORED_NOTIFY_JOB = 'parcel-stored';
export const PARCEL_OVERDUE_NOTIFY_JOB = 'parcel-overdue';
export const TENANT_APPROVED_NOTIFY_JOB = 'tenant-approved';
export const APPLICATION_REJECTED_NOTIFY_JOB = 'application-rejected';

/**
 * Retry policy for notification delivery jobs. A transient channel outage
 * (e.g. SMS provider hiccup) must be retried with exponential backoff instead
 * of being silently dropped. After all attempts are exhausted the job lands in
 * BullMQ's `failed` set (kept via removeOnFail) so it can be inspected / redriven
 * as a dead-letter queue.
 */
export const NOTIFY_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: true,
  removeOnFail: 500,
};

export interface ParcelStoredNotifyJobData {
  parcelId: string;
  tenantId: string;
  stationId: string;
  stationName?: string;
  receiverPhone: string;
  pickupCode: string;
  slotCode?: string;
  consumerId?: string | null;
}

export interface ParcelOverdueNotifyJobData {
  parcelId: string;
  tenantId: string;
  stationId: string;
  stationName?: string;
  receiverPhone: string;
  pickupCode?: string | null;
  slotCode?: string | null;
  consumerId?: string | null;
  level: 1 | 2 | 3;
  daysOverdue: number;
}

export interface TenantApprovedNotifyJobData {
  applicationId: string;
  tenantId: string;
  stationId?: string;
  ownerUserId: string;
  ownerUsername: string;
  tempPassword?: string;
  planCode: string;
}

export interface ApplicationRejectedNotifyJobData {
  applicationId: string;
  contactPhone: string;
  rejectReason: string;
}

export type NotifyJobData =
  | ParcelStoredNotifyJobData
  | ParcelOverdueNotifyJobData
  | TenantApprovedNotifyJobData
  | ApplicationRejectedNotifyJobData;

export function notifyJobId(...parts: Array<string | number | null | undefined>) {
  return parts
    .filter((part) => part !== null && part !== undefined && part !== '')
    .map((part) => String(part).replace(/:/g, '_'))
    .join('__');
}
