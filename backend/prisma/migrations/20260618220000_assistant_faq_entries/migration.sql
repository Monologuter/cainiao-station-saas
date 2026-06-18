-- CreateEnum
CREATE TYPE "FaqCategory" AS ENUM ('PICKUP', 'SHIPPING', 'PARCEL_STATUS', 'MEMBER', 'GENERAL');

-- CreateTable
CREATE TABLE "faq_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "category" "FaqCategory" NOT NULL,
    "question" VARCHAR(300) NOT NULL,
    "answer" TEXT NOT NULL,
    "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "embedding" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "source" VARCHAR(120) NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID,

    CONSTRAINT "faq_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "faq_entries_tenant_id_category_enabled_idx" ON "faq_entries"("tenant_id", "category", "enabled");

-- CreateIndex
CREATE INDEX "faq_entries_enabled_priority_idx" ON "faq_entries"("enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "faq_entries_platform_question_key" ON "faq_entries"("question") WHERE "tenant_id" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "faq_entries_tenant_question_key" ON "faq_entries"("tenant_id", "question") WHERE "tenant_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "faq_entries" ADD CONSTRAINT "faq_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "faq_entries" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "faq_entries_tenant_or_platform_read" ON "faq_entries"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" IS NULL
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE "faq_entries" FORCE ROW LEVEL SECURITY;
