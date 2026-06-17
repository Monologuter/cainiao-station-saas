export type UsageMetricCode = 'SMS' | 'PARCELS' | 'EXTRA_STATIONS';

export const USAGE_METRICS: UsageMetricCode[] = [
  'SMS',
  'PARCELS',
  'EXTRA_STATIONS',
];

export const PLAN_KEY_BY_METRIC: Record<UsageMetricCode, string> = {
  SMS: 'sms',
  PARCELS: 'parcels',
  EXTRA_STATIONS: 'stations',
};
