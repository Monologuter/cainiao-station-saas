-- CreateEnum
CREATE TYPE "ReportJobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('DAILY_SUMMARY', 'INBOUND_DETAIL', 'PICKUP_DETAIL', 'STATION_COMPARE');

-- CreateTable
CREATE TABLE "metric_daily" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "station_id" UUID,
    "stat_date" DATE NOT NULL,
    "metric" VARCHAR(40) NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "station_id" UUID,
    "type" "ReportType" NOT NULL,
    "range_from" DATE NOT NULL,
    "range_to" DATE NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "status" "ReportJobStatus" NOT NULL DEFAULT 'PENDING',
    "file_key" VARCHAR(255),
    "error" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "metric_daily_tenant_id_station_id_stat_date_metric_key" ON "metric_daily"("tenant_id", "station_id", "stat_date", "metric");

-- CreateIndex
CREATE INDEX "metric_daily_tenant_id_stat_date_metric_idx" ON "metric_daily"("tenant_id", "stat_date", "metric");

-- CreateIndex
CREATE INDEX "metric_daily_tenant_id_station_id_stat_date_idx" ON "metric_daily"("tenant_id", "station_id", "stat_date");

-- CreateIndex
CREATE INDEX "report_jobs_tenant_id_status_created_at_idx" ON "report_jobs"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "report_jobs_tenant_id_station_id_created_at_idx" ON "report_jobs"("tenant_id", "station_id", "created_at");

-- AddForeignKey
ALTER TABLE "metric_daily" ADD CONSTRAINT "metric_daily_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_daily" ADD CONSTRAINT "metric_daily_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "metric_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_jobs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_metric_daily ON "metric_daily"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY tenant_isolation_report_jobs ON "report_jobs"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE "metric_daily" FORCE ROW LEVEL SECURITY;
ALTER TABLE "report_jobs" FORCE ROW LEVEL SECURITY;
