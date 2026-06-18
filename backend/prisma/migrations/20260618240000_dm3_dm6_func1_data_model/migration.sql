-- ============================================================================
-- DM-3 + DM-6 + FUNC-1: 数据模型修复
-- 仅触及这三处关注点，刻意避开 Prisma migrate diff 带出的历史命名漂移
-- （faq_entries/ai_messages FK、volume_forecasts/wechat 索引重命名等已应用迁移，
--   Prisma 不重放，无需在此变更）。
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FUNC-1: 包裹尺寸 ParcelSize 枚举 + parcels.size 字段（默认 M）
-- ----------------------------------------------------------------------------
CREATE TYPE "ParcelSize" AS ENUM ('S', 'M', 'L');

ALTER TABLE "parcels"
  ADD COLUMN "size" "ParcelSize" NOT NULL DEFAULT 'M';

-- ----------------------------------------------------------------------------
-- DM-6: ship_orders.consumer_id 类型漂移 text -> uuid
--
-- 存量盘点（cainiao 库，含 RLS 旁路统计）：499 行中 56 行 consumer_id 非空，
-- 其中 44 行为合法 uuid，12 行为历史占位串（形如 'phone:13xxxxxxxxx'）。
-- consumerId 为可空、且无 Consumer 外键，这些占位串从来不是有效的 Consumer 引用，
-- 故转换前先将「无法解析为 uuid 的值」清成 NULL，避免 22P02 转换失败、也不丢真实引用。
--
-- 转换用 USING CASE 兜底：合法 uuid 原样转换，其余落 NULL（双保险，幂等）。
-- 先 drop consumer_id 上的查询索引，转换后再以 uuid 列重建，避免依赖 ALTER 隐式重建。
-- ----------------------------------------------------------------------------
-- 显式清洗历史占位值（审计可见），仅命中无法解析为 uuid 的非空行。
UPDATE "ship_orders"
  SET "consumer_id" = NULL
  WHERE "consumer_id" IS NOT NULL
    AND "consumer_id" !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

DROP INDEX IF EXISTS "ship_orders_tenant_id_consumer_id_idx";
ALTER TABLE "ship_orders"
  ALTER COLUMN "consumer_id" TYPE UUID
  USING (
    CASE
      WHEN "consumer_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN "consumer_id"::uuid
      ELSE NULL
    END
  );
CREATE INDEX "ship_orders_tenant_id_consumer_id_idx"
  ON "ship_orders"("tenant_id", "consumer_id");

-- ----------------------------------------------------------------------------
-- DM-3: 软删表自然键改为「仅未软删行唯一」的部分唯一索引
-- 先 drop 原全表唯一索引，再建 WHERE deleted_at IS NULL 的部分唯一索引，
-- 使软删某条后可用同一自然键重建。
-- 同时补回 Prisma schema 中改用的普通 @@index（查询性能用）。
-- ----------------------------------------------------------------------------

-- shelves: (station_id, code)
DROP INDEX IF EXISTS "shelves_station_id_code_key";
CREATE UNIQUE INDEX "ux_shelves_active_code"
  ON "shelves"("station_id", "code")
  WHERE "deleted_at" IS NULL;
CREATE INDEX "shelves_station_id_code_idx"
  ON "shelves"("station_id", "code");

-- slots: (station_id, code) — batchCreate 的 createMany(skipDuplicates) 依赖此部分唯一索引去重
DROP INDEX IF EXISTS "slots_station_id_code_key";
CREATE UNIQUE INDEX "ux_slots_active_code"
  ON "slots"("station_id", "code")
  WHERE "deleted_at" IS NULL;
CREATE INDEX "slots_station_id_code_idx"
  ON "slots"("station_id", "code");

-- exceptions: (tenant_id, code)
DROP INDEX IF EXISTS "exceptions_tenant_id_code_key";
CREATE UNIQUE INDEX "ux_exceptions_active_code"
  ON "exceptions"("tenant_id", "code")
  WHERE "deleted_at" IS NULL;
CREATE INDEX "exceptions_tenant_id_code_idx"
  ON "exceptions"("tenant_id", "code");

-- ship_orders: (tenant_id, order_no)
DROP INDEX IF EXISTS "ship_orders_tenant_id_order_no_key";
CREATE UNIQUE INDEX "ux_ship_orders_active_order_no"
  ON "ship_orders"("tenant_id", "order_no")
  WHERE "deleted_at" IS NULL;
CREATE INDEX "ship_orders_tenant_id_order_no_idx"
  ON "ship_orders"("tenant_id", "order_no");

-- consumer_id 现在是 uuid 列，重建其查询索引（与 schema @@index([tenantId, consumerId]) 对齐）
DROP INDEX IF EXISTS "ship_orders_tenant_id_consumer_id_idx";
CREATE INDEX "ship_orders_tenant_id_consumer_id_idx"
  ON "ship_orders"("tenant_id", "consumer_id");
