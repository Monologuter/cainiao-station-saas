-- CreateEnum
CREATE TYPE "ReviewTargetType" AS ENUM ('PICKUP', 'SHIP');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED', 'REPLIED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ComplaintType" AS ENUM ('DAMAGE', 'LOST', 'SERVICE', 'WRONG', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('PENDING', 'PROCESSING', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "consumer_phone" VARCHAR(20) NOT NULL,
    "target_type" "ReviewTargetType" NOT NULL,
    "ref_type" VARCHAR(32) NOT NULL,
    "ref_id" VARCHAR(64) NOT NULL,
    "rating" SMALLINT NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "content" VARCHAR(500),
    "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "reply_content" VARCHAR(500),
    "replied_by" UUID,
    "replied_at" TIMESTAMP(3),
    "hidden_by" UUID,
    "hidden_at" TIMESTAMP(3),
    "hide_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "consumer_phone" VARCHAR(20) NOT NULL,
    "type" "ComplaintType" NOT NULL,
    "ref_type" VARCHAR(32),
    "ref_id" VARCHAR(64),
    "content" VARCHAR(1000) NOT NULL,
    "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "ComplaintStatus" NOT NULL DEFAULT 'PENDING',
    "handle_note" VARCHAR(1000),
    "handled_by" UUID,
    "handled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reviews_tenant_id_ref_type_ref_id_member_id_key" ON "reviews"("tenant_id", "ref_type", "ref_id", "member_id");

-- CreateIndex
CREATE INDEX "reviews_tenant_id_station_id_created_at_idx" ON "reviews"("tenant_id", "station_id", "created_at");

-- CreateIndex
CREATE INDEX "reviews_tenant_id_rating_idx" ON "reviews"("tenant_id", "rating");

-- CreateIndex
CREATE INDEX "complaints_tenant_id_station_id_status_idx" ON "complaints"("tenant_id", "station_id", "status");

-- CreateIndex
CREATE INDEX "complaints_tenant_id_member_id_status_idx" ON "complaints"("tenant_id", "member_id", "status");

-- CreateIndex
CREATE INDEX "complaints_tenant_id_created_at_idx" ON "complaints"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "complaints" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_reviews ON "reviews"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY tenant_isolation_complaints ON "complaints"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE "reviews" FORCE ROW LEVEL SECURITY;
ALTER TABLE "complaints" FORCE ROW LEVEL SECURITY;
