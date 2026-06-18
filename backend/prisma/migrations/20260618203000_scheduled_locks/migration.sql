-- CreateTable
CREATE TABLE "scheduled_locks" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "locked_until" TIMESTAMP(3) NOT NULL,
    "locked_by" VARCHAR(120),
    "run_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_locks_pkey" PRIMARY KEY ("id")
);

COMMENT ON TABLE "scheduled_locks" IS '平台级定时任务锁表，不含 tenant_id，显式 RLS 例外';

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_locks_name_key" ON "scheduled_locks"("name");

-- CreateIndex
CREATE INDEX "scheduled_locks_locked_until_idx" ON "scheduled_locks"("locked_until");
