-- CreateEnum
CREATE TYPE "ShelfStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('FREE', 'OCCUPIED', 'DISABLED');

-- CreateTable
CREATE TABLE "shelves" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zone" TEXT,
    "status" "ShelfStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID,

    CONSTRAINT "shelves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "shelf_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "row_no" INTEGER,
    "level_no" INTEGER,
    "col_no" INTEGER,
    "status" "SlotStatus" NOT NULL DEFAULT 'FREE',
    "current_parcel_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_by" UUID,

    CONSTRAINT "slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shelves_tenant_id_station_id_idx" ON "shelves"("tenant_id", "station_id");

-- CreateIndex
CREATE UNIQUE INDEX "shelves_station_id_code_key" ON "shelves"("station_id", "code");

-- CreateIndex
CREATE INDEX "slots_tenant_id_station_id_status_idx" ON "slots"("tenant_id", "station_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "slots_station_id_code_key" ON "slots"("station_id", "code");

-- AddForeignKey
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slots" ADD CONSTRAINT "slots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slots" ADD CONSTRAINT "slots_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slots" ADD CONSTRAINT "slots_shelf_id_fkey" FOREIGN KEY ("shelf_id") REFERENCES "shelves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "shelves" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "slots" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_shelves ON "shelves"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY tenant_isolation_slots ON "slots"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE "shelves" FORCE ROW LEVEL SECURITY;
ALTER TABLE "slots" FORCE ROW LEVEL SECURITY;
