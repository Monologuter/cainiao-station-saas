import { describe, expect, it, vi } from "vitest";
import { http } from "./http";
import {
  submitOnboardingApplicationApi,
  trackOnboardingApplicationApi,
  uploadQualificationUrlApi,
} from "./onboarding";

describe("station onboarding api", () => {
  it("maps upload, submit and track public endpoints", async () => {
    const post = vi.spyOn(http, "post").mockResolvedValue({});
    const get = vi.spyOn(http, "get").mockResolvedValue({});

    await uploadQualificationUrlApi({
      fileType: "BUSINESS_LICENSE",
      contentType: "image/jpeg",
    });
    await submitOnboardingApplicationApi({
      entityType: "COMPANY",
      entityName: "测试主体",
      unifiedCreditCode: "91310000123456789X",
      regionCode: "310000",
      contactName: "张三",
      contactPhone: "13800000000",
      stationName: "测试驿站",
      stationAddress: "上海市测试路 1 号",
      proposedPlanCode: "BASIC",
      qualifications: [
        { type: "BUSINESS_LICENSE", fileKey: "onboarding/a.jpg", fileName: "a.jpg" },
      ],
    });
    await trackOnboardingApplicationApi({
      applicationNo: "APP20260618-0001",
      contactPhone: "13800000000",
    });

    expect(post).toHaveBeenCalledWith("/onboarding/qualifications/upload-url", {
      fileType: "BUSINESS_LICENSE",
      contentType: "image/jpeg",
    });
    expect(post).toHaveBeenCalledWith("/onboarding/applications", expect.any(Object));
    expect(get).toHaveBeenCalledWith("/onboarding/applications/track", {
      params: {
        applicationNo: "APP20260618-0001",
        contactPhone: "13800000000",
      },
    });
  });
});
