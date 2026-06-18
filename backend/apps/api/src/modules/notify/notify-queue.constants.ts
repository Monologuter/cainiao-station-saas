import type { JobsOptions } from 'bullmq';

export const NOTIFY_QUEUE_NAME = 'notify';
export const NOTIFY_QUEUE = Symbol('NOTIFY_QUEUE');

/** Job name for "ParcelStored -> send notification" work items. */
export const PARCEL_STORED_NOTIFY_JOB = 'parcel-stored';

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
}
