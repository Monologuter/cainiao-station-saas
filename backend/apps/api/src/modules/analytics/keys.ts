export const ANALYTICS_KEY_TTL_SECONDS = 35 * 24 * 60 * 60;

export const analyticsKeys = {
  count(tenantId: string, stationId: string, date: string) {
    return `an:cnt:${tenantId}:${stationId}:${date}`;
  },
  platformCount(date: string) {
    return `an:plat:cnt:${date}`;
  },
  stored(tenantId: string, stationId: string) {
    return `an:stored:${tenantId}:${stationId}`;
  },
  stationRank(tenantId: string, metric: string, date: string) {
    return `an:rank:station:${tenantId}:${metric}:${date}`;
  },
  overdueRank(tenantId: string, stationId: string) {
    return `an:rank:overdue:${tenantId}:${stationId}`;
  },
  heat(tenantId: string, stationId: string) {
    return `an:heat:${tenantId}:${stationId}`;
  },
  dedup(date: string) {
    return `an:dedup:${date}`;
  },
};
