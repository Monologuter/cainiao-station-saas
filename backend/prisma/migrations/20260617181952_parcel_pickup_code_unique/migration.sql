-- This is an empty migration.
CREATE UNIQUE INDEX ux_parcel_active_code
  ON "parcels"("station_id", "pickup_code")
  WHERE "status" = 'STORED' AND "pickup_code" IS NOT NULL AND "deleted_at" IS NULL;
