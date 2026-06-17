-- CreateEnum
CREATE TYPE "ParcelStatus" AS ENUM ('PENDING', 'STORED', 'PICKED_UP', 'EXCEPTION', 'RETURNED');

-- CreateEnum
CREATE TYPE "ParcelEventType" AS ENUM ('INBOUND', 'STORED', 'PICKED_UP', 'EXCEPTION', 'RETURNED');

-- CreateTable
CREATE TABLE "parcels" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "waybill_no" TEXT NOT NULL,
    "carrier" TEXT,
    "receiver_phone" TEXT NOT NULL,
    "receiver_phone_tail" TEXT NOT NULL,
    "pickup_code" TEXT,
    "slot_id" UUID,
    "status" "ParcelStatus" NOT NULL DEFAULT 'PENDING',
    "stored_at" TIMESTAMP(3),
    "picked_up_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID,

    CONSTRAINT "parcels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parcel_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "parcel_id" UUID NOT NULL,
    "from_status" "ParcelStatus",
    "to_status" "ParcelStatus" NOT NULL,
    "event_type" "ParcelEventType" NOT NULL,
    "operator_id" UUID,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parcel_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parcels_tenant_id_station_id_status_idx" ON "parcels"("tenant_id", "station_id", "status");

-- CreateIndex
CREATE INDEX "parcels_tenant_id_receiver_phone_idx" ON "parcels"("tenant_id", "receiver_phone");

-- CreateIndex
CREATE INDEX "parcels_tenant_id_station_id_receiver_phone_tail_status_idx" ON "parcels"("tenant_id", "station_id", "receiver_phone_tail", "status");

-- CreateIndex
CREATE INDEX "parcel_events_tenant_id_parcel_id_created_at_idx" ON "parcel_events"("tenant_id", "parcel_id", "created_at");

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_events" ADD CONSTRAINT "parcel_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parcel_events" ADD CONSTRAINT "parcel_events_parcel_id_fkey" FOREIGN KEY ("parcel_id") REFERENCES "parcels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "parcels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parcel_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_parcels ON "parcels"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY tenant_isolation_parcel_events ON "parcel_events"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE "parcels" FORCE ROW LEVEL SECURITY;
ALTER TABLE "parcel_events" FORCE ROW LEVEL SECURITY;
