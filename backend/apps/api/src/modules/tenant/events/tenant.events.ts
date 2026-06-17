export interface TenantApprovedPayload {
  applicationId: string;
  tenantId: string;
  stationId: string;
  ownerUserId: string;
  ownerUsername: string;
  tempPassword?: string;
  planCode: string;
}

export interface ApplicationRejectedPayload {
  applicationId: string;
  contactPhone: string;
  rejectReason: string;
}
