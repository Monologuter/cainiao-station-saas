export interface TenantApprovedPayload {
  applicationId: string;
  tenantId: string;
  stationId: string;
  ownerUserId: string;
  ownerUsername: string;
  planCode: string;
}

export interface ApplicationRejectedPayload {
  applicationId: string;
  contactPhone: string;
  rejectReason: string;
}
