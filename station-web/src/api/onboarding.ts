import { http } from "./http";

export interface QualificationFile {
  type: string;
  fileKey: string;
  fileName: string;
}

export interface UploadQualificationInput {
  fileType: string;
  contentType: string;
}

export interface UploadQualificationResult {
  uploadUrl: string;
  fileKey: string;
  expiresIn: number;
}

export interface SubmitOnboardingApplicationInput {
  entityType: "INDIVIDUAL" | "COMPANY";
  entityName: string;
  unifiedCreditCode?: string;
  regionCode: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  stationName: string;
  stationAddress: string;
  proposedPlanCode?: string;
  qualifications: QualificationFile[];
}

export interface OnboardingApplicationResult {
  applicationNo: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectReason?: string | null;
}

export function uploadQualificationUrlApi(input: UploadQualificationInput) {
  return http.post<never, UploadQualificationResult>(
    "/onboarding/qualifications/upload-url",
    input,
  );
}

export function submitOnboardingApplicationApi(
  input: SubmitOnboardingApplicationInput,
) {
  return http.post<never, OnboardingApplicationResult>(
    "/onboarding/applications",
    input,
  );
}

export function trackOnboardingApplicationApi(input: {
  applicationNo: string;
  contactPhone: string;
}) {
  return http.get<never, OnboardingApplicationResult>(
    "/onboarding/applications/track",
    { params: input },
  );
}
