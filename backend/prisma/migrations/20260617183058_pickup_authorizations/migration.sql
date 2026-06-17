-- CreateEnum
CREATE TYPE "PickupAuthorizationStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "pickup_authorizations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "owner_phone" TEXT NOT NULL,
    "authorized_phone" TEXT NOT NULL,
    "status" "PickupAuthorizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID,

    CONSTRAINT "pickup_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pickup_authorizations_tenant_id_owner_phone_status_idx" ON "pickup_authorizations"("tenant_id", "owner_phone", "status");

-- CreateIndex
CREATE INDEX "pickup_authorizations_tenant_id_authorized_phone_status_idx" ON "pickup_authorizations"("tenant_id", "authorized_phone", "status");

-- AddForeignKey
ALTER TABLE "pickup_authorizations" ADD CONSTRAINT "pickup_authorizations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pickup_authorizations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_pickup_authorizations ON "pickup_authorizations"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE "pickup_authorizations" FORCE ROW LEVEL SECURITY;
