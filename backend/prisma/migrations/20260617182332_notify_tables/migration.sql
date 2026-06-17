-- CreateEnum
CREATE TYPE "NotifyChannelType" AS ENUM ('IN_APP', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "parcel_id" UUID,
    "receiver_phone" TEXT NOT NULL,
    "channel" "NotifyChannelType" NOT NULL,
    "template_code" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "dedup_key" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notify_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "code" TEXT NOT NULL,
    "channel" "NotifyChannelType" NOT NULL,
    "content" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "notify_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_tenant_id_parcel_id_idx" ON "notifications"("tenant_id", "parcel_id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_receiver_phone_idx" ON "notifications"("tenant_id", "receiver_phone");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_dedup_key_key" ON "notifications"("tenant_id", "dedup_key");

-- CreateIndex
CREATE UNIQUE INDEX "notify_templates_tenant_id_code_channel_key" ON "notify_templates"("tenant_id", "code", "channel");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notify_templates" ADD CONSTRAINT "notify_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notify_templates" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_notifications ON "notifications"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY tenant_isolation_notify_templates ON "notify_templates"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" IS NULL
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
ALTER TABLE "notify_templates" FORCE ROW LEVEL SECURITY;
