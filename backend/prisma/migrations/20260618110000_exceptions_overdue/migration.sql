-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('DAMAGED', 'MISDELIVERED', 'UNCLAIMED', 'REJECTED', 'OVERSIZED');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ExceptionResolution" AS ENUM ('CONTACT_COURIER', 'RETURN', 'RESTOCK', 'VOID');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "parcels" ADD COLUMN "last_overdue_level" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "parcels" ADD COLUMN "overdue_returned_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "exceptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "parcel_id" UUID,
    "code" VARCHAR(40) NOT NULL,
    "type" "ExceptionType" NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" "ExceptionResolution",
    "severity" "Severity",
    "description" TEXT NOT NULL,
    "evidence_urls" JSONB NOT NULL DEFAULT '[]',
    "assignee_id" UUID,
    "parcel_status_before" "ParcelStatus",
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID,

    CONSTRAINT "exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exceptions_tenant_id_code_key" ON "exceptions"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "exceptions_tenant_id_status_idx" ON "exceptions"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "exceptions_tenant_id_station_id_status_idx" ON "exceptions"("tenant_id", "station_id", "status");

-- CreateIndex
CREATE INDEX "exceptions_tenant_id_parcel_id_idx" ON "exceptions"("tenant_id", "parcel_id");

-- AddForeignKey
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "exceptions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_exceptions ON "exceptions"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE "exceptions" FORCE ROW LEVEL SECURITY;
