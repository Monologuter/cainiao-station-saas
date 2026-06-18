-- CreateEnum
CREATE TYPE "OcrRecognitionStatus" AS ENUM ('RECOGNIZED', 'LOW_CONFIDENCE', 'FAILED', 'CONFIRMED', 'FALLBACK_MANUAL');

-- CreateTable
CREATE TABLE "ocr_recognitions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "waybill_no" VARCHAR(64),
    "phone_tail" VARCHAR(4),
    "courier_code" VARCHAR(16),
    "confidence" JSONB NOT NULL,
    "status" "OcrRecognitionStatus" NOT NULL,
    "parcel_id" UUID,
    "latency_ms" INTEGER,
    "error_code" VARCHAR(60),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID,

    CONSTRAINT "ocr_recognitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ocr_recognitions_tenant_id_created_at_idx" ON "ocr_recognitions"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "ocr_recognitions_tenant_id_station_id_status_idx" ON "ocr_recognitions"("tenant_id", "station_id", "status");

-- CreateIndex
CREATE INDEX "ocr_recognitions_tenant_id_waybill_no_idx" ON "ocr_recognitions"("tenant_id", "waybill_no");

-- AddForeignKey
ALTER TABLE "ocr_recognitions" ADD CONSTRAINT "ocr_recognitions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_recognitions" ADD CONSTRAINT "ocr_recognitions_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocr_recognitions" ADD CONSTRAINT "ocr_recognitions_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ocr_recognitions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ocr_recognitions_tenant_isolation" ON "ocr_recognitions"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE "ocr_recognitions" FORCE ROW LEVEL SECURITY;
