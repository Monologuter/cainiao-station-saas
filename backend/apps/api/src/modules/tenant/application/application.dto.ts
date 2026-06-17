export interface QualificationInput {
  type: string;
  fileKey: string;
  fileName: string;
}

export interface SubmitApplicationInput {
  entityType: 'INDIVIDUAL' | 'COMPANY';
  entityName: string;
  unifiedCreditCode?: string;
  regionCode: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  stationName: string;
  stationAddress: string;
  proposedPlanCode?: string;
  qualifications: QualificationInput[];
}
