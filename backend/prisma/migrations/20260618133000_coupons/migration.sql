-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('DISCOUNT', 'RATE', 'EXEMPT');

-- CreateEnum
CREATE TYPE "CouponScene" AS ENUM ('PICKUP', 'SHIP', 'ALL');

-- CreateEnum
CREATE TYPE "CouponTemplateStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CouponStatus" AS ENUM ('UNUSED', 'USED', 'EXPIRED', 'FROZEN');

-- CreateEnum
CREATE TYPE "CouponObtainedVia" AS ENUM ('POINT_REDEEM', 'ISSUE', 'CHECKIN_REWARD');

-- CreateTable
CREATE TABLE "coupon_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "type" "CouponType" NOT NULL,
    "face_value" DECIMAL(10,2) NOT NULL,
    "threshold" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "scene" "CouponScene" NOT NULL,
    "cost_points" INTEGER,
    "total_stock" INTEGER,
    "issued_count" INTEGER NOT NULL DEFAULT 0,
    "valid_days" INTEGER NOT NULL,
    "status" "CouponTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID,

    CONSTRAINT "coupon_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "status" "CouponStatus" NOT NULL DEFAULT 'UNUSED',
    "obtained_via" "CouponObtainedVia" NOT NULL,
    "point_record_id" UUID,
    "used_at" TIMESTAMP(3),
    "used_ref_type" VARCHAR(32),
    "used_ref_id" VARCHAR(64),
    "expire_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coupon_templates_tenant_id_status_idx" ON "coupon_templates"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "coupon_templates_tenant_id_scene_idx" ON "coupon_templates"("tenant_id", "scene");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_tenant_id_member_id_status_idx" ON "coupons"("tenant_id", "member_id", "status");

-- CreateIndex
CREATE INDEX "coupons_expire_at_status_idx" ON "coupons"("expire_at", "status");

-- AddForeignKey
ALTER TABLE "coupon_templates" ADD CONSTRAINT "coupon_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "coupon_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "coupon_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "coupons" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_coupon_templates ON "coupon_templates"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY tenant_isolation_coupons ON "coupons"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE "coupon_templates" FORCE ROW LEVEL SECURITY;
ALTER TABLE "coupons" FORCE ROW LEVEL SECURITY;
