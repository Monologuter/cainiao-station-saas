-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateTable
CREATE TABLE "tenant_applications" (
    "id" UUID NOT NULL,
    "application_no" VARCHAR(40) NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "entity_type" "EntityType" NOT NULL,
    "entity_name" VARCHAR(120) NOT NULL,
    "unified_credit_code" VARCHAR(64),
    "region_code" VARCHAR(20) NOT NULL,
    "contact_name" VARCHAR(60) NOT NULL,
    "contact_phone" VARCHAR(20) NOT NULL,
    "contact_email" VARCHAR(120),
    "station_name" VARCHAR(120) NOT NULL,
    "station_address" VARCHAR(255) NOT NULL,
    "proposed_plan_code" VARCHAR(40),
    "qualifications" JSONB NOT NULL DEFAULT '[]',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "reject_reason" VARCHAR(500),
    "approved_tenant_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tenant_applications_pkey" PRIMARY KEY ("id")
);

-- Platform-level table: applications are submitted before a tenant exists, so this table intentionally does not use tenant RLS.
COMMENT ON TABLE "tenant_applications" IS 'platform-level onboarding application table; intentionally does not use tenant RLS because applications are submitted before tenant context exists';

-- CreateIndex
CREATE UNIQUE INDEX "tenant_applications_application_no_key" ON "tenant_applications"("application_no");

-- CreateIndex
CREATE INDEX "tenant_applications_status_created_at_idx" ON "tenant_applications"("status", "created_at");

-- CreateIndex
CREATE INDEX "tenant_applications_contact_phone_idx" ON "tenant_applications"("contact_phone");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_active_tenant_application_phone"
  ON "tenant_applications"("contact_phone")
  WHERE "status" = 'PENDING' AND "deleted_at" IS NULL;

-- SeedPermission
INSERT INTO "Permission" ("id", "code", "name", "module")
VALUES (gen_random_uuid(), 'tenant:review', '审核入驻', 'tenant')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "module" = EXCLUDED."module";
