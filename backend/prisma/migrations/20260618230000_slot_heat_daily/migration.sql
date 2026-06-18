-- CreateTable
CREATE TABLE "slot_heat_daily" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "stat_date" DATE NOT NULL,
    "pick_count" INTEGER NOT NULL DEFAULT 0,
    "store_count" INTEGER NOT NULL DEFAULT 0,
    "avg_dwell_minutes" INTEGER NOT NULL DEFAULT 0,
    "hour_histogram" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slot_heat_daily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slot_heat_daily_tenant_id_slot_id_stat_date_key" ON "slot_heat_daily"("tenant_id", "slot_id", "stat_date");

-- CreateIndex
CREATE INDEX "slot_heat_daily_tenant_id_station_id_stat_date_idx" ON "slot_heat_daily"("tenant_id", "station_id", "stat_date");

-- AddForeignKey
ALTER TABLE "slot_heat_daily" ADD CONSTRAINT "slot_heat_daily_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_heat_daily" ADD CONSTRAINT "slot_heat_daily_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_heat_daily" ADD CONSTRAINT "slot_heat_daily_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "slot_heat_daily" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slot_heat_daily_tenant_isolation" ON "slot_heat_daily"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE "slot_heat_daily" FORCE ROW LEVEL SECURITY;
