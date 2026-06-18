-- CreateEnum
CREATE TYPE "ForecastGranularity" AS ENUM ('DAY', 'HOUR');

-- CreateEnum
CREATE TYPE "ForecastMethod" AS ENUM ('MA', 'HOLT_WINTERS', 'FALLBACK_MEAN');

-- CreateTable
CREATE TABLE "volume_forecasts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "target_date" DATE NOT NULL,
    "granularity" "ForecastGranularity" NOT NULL,
    "predicted_volume" INTEGER NOT NULL,
    "hour_breakdown" JSONB,
    "method" "ForecastMethod" NOT NULL,
    "lower_bound" INTEGER NOT NULL,
    "upper_bound" INTEGER NOT NULL,
    "actual_volume" INTEGER,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volume_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "volume_forecasts_tenant_id_station_id_target_date_idx" ON "volume_forecasts"("tenant_id", "station_id", "target_date");

-- CreateIndex
CREATE INDEX "volume_forecasts_tenant_id_station_id_granularity_generated_at_idx" ON "volume_forecasts"("tenant_id", "station_id", "granularity", "generated_at");

-- AddForeignKey
ALTER TABLE "volume_forecasts" ADD CONSTRAINT "volume_forecasts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volume_forecasts" ADD CONSTRAINT "volume_forecasts_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "volume_forecasts" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "volume_forecasts_tenant_isolation" ON "volume_forecasts"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE "volume_forecasts" FORCE ROW LEVEL SECURITY;
