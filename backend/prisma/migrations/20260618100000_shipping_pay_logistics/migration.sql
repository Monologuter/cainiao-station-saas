-- CreateEnum
CREATE TYPE "ShipOrderChannel" AS ENUM ('STATION', 'ONLINE');

-- CreateEnum
CREATE TYPE "ShipOrderStatus" AS ENUM ('CREATED', 'PAID', 'COLLECTED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentBizType" AS ENUM ('SHIP_ORDER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "LogisticsNodeStatus" AS ENUM ('COLLECTED', 'IN_TRANSIT', 'ARRIVED', 'OUT_FOR_DELIVERY', 'DELIVERED');

-- CreateEnum
CREATE TYPE "LogisticsTrackSource" AS ENUM ('MOCK', 'PROVIDER');

-- CreateTable
CREATE TABLE "ship_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "station_id" UUID,
    "order_no" TEXT NOT NULL,
    "channel" "ShipOrderChannel" NOT NULL,
    "status" "ShipOrderStatus" NOT NULL DEFAULT 'CREATED',
    "sender_json" JSONB NOT NULL,
    "receiver_json" JSONB NOT NULL,
    "item_json" JSONB NOT NULL,
    "weight_gram" INTEGER NOT NULL,
    "courier_code" VARCHAR(16) NOT NULL,
    "courier_name" VARCHAR(32) NOT NULL,
    "quote_amount" INTEGER NOT NULL,
    "quote_snapshot_json" JSONB NOT NULL,
    "consumer_id" TEXT,
    "waybill_no" VARCHAR(40),
    "paid_at" TIMESTAMP(3),
    "collected_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID,

    CONSTRAINT "ship_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "courier_code" VARCHAR(16) NOT NULL,
    "courier_name" VARCHAR(32) NOT NULL,
    "zone" VARCHAR(16) NOT NULL,
    "first_weight_gram" INTEGER NOT NULL DEFAULT 1000,
    "first_price" INTEGER NOT NULL,
    "add_unit_gram" INTEGER NOT NULL DEFAULT 1000,
    "add_price" INTEGER NOT NULL,
    "zone_factor" DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    "est_hours" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID,

    CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "biz_type" "PaymentBizType" NOT NULL,
    "biz_id" UUID NOT NULL,
    "channel" VARCHAR(16) NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" VARCHAR(64) NOT NULL,
    "out_trade_no" VARCHAR(64) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "raw_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_tracks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ship_order_id" UUID NOT NULL,
    "waybill_no" VARCHAR(40) NOT NULL,
    "seq" INTEGER NOT NULL,
    "node_status" "LogisticsNodeStatus" NOT NULL,
    "location" VARCHAR(64) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "happened_at" TIMESTAMP(3) NOT NULL,
    "source" "LogisticsTrackSource" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logistics_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ship_orders_tenant_id_order_no_key" ON "ship_orders"("tenant_id", "order_no");

-- CreateIndex
CREATE INDEX "ship_orders_tenant_id_status_idx" ON "ship_orders"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "ship_orders_tenant_id_station_id_idx" ON "ship_orders"("tenant_id", "station_id");

-- CreateIndex
CREATE INDEX "ship_orders_tenant_id_consumer_id_idx" ON "ship_orders"("tenant_id", "consumer_id");

-- CreateIndex
CREATE INDEX "ship_orders_waybill_no_idx" ON "ship_orders"("waybill_no");

-- CreateIndex
CREATE INDEX "price_rules_tenant_id_courier_code_zone_enabled_idx" ON "price_rules"("tenant_id", "courier_code", "zone", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_idempotency_key_key" ON "payments"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "payments_tenant_id_biz_type_biz_id_idx" ON "payments"("tenant_id", "biz_type", "biz_id");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_tracks_ship_order_id_seq_key" ON "logistics_tracks"("ship_order_id", "seq");

-- CreateIndex
CREATE INDEX "logistics_tracks_tenant_id_ship_order_id_idx" ON "logistics_tracks"("tenant_id", "ship_order_id");

-- CreateIndex
CREATE INDEX "logistics_tracks_waybill_no_idx" ON "logistics_tracks"("waybill_no");

-- AddForeignKey
ALTER TABLE "ship_orders" ADD CONSTRAINT "ship_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ship_orders" ADD CONSTRAINT "ship_orders_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_tracks" ADD CONSTRAINT "logistics_tracks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_tracks" ADD CONSTRAINT "logistics_tracks_ship_order_id_fkey" FOREIGN KEY ("ship_order_id") REFERENCES "ship_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ship_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "price_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "logistics_tracks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_ship_orders ON "ship_orders"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY tenant_isolation_price_rules ON "price_rules"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY tenant_isolation_payments ON "payments"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY tenant_isolation_logistics_tracks ON "logistics_tracks"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE "ship_orders" FORCE ROW LEVEL SECURITY;
ALTER TABLE "price_rules" FORCE ROW LEVEL SECURITY;
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "logistics_tracks" FORCE ROW LEVEL SECURITY;
