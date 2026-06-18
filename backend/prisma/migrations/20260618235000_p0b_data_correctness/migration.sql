-- DM-1: staff-to-station assignment table for station-scoped staff accounts.
CREATE TABLE "staff_stations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "station_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_stations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_stations_user_id_station_id_key"
    ON "staff_stations"("user_id", "station_id");
CREATE INDEX "staff_stations_tenant_id_station_id_idx"
    ON "staff_stations"("tenant_id", "station_id");
CREATE INDEX "staff_stations_tenant_id_user_id_idx"
    ON "staff_stations"("tenant_id", "user_id");

ALTER TABLE "staff_stations"
    ADD CONSTRAINT "staff_stations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_stations"
    ADD CONSTRAINT "staff_stations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_stations"
    ADD CONSTRAINT "staff_stations_station_id_fkey"
    FOREIGN KEY ("station_id") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_stations" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_stations_tenant_isolation" ON "staff_stations"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER TABLE "staff_stations" FORCE ROW LEVEL SECURITY;

-- DM-2: at most one active parcel per tenant/station/waybill.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_parcel_active_waybill"
  ON "parcels"("tenant_id", "station_id", "waybill_no")
  WHERE "deleted_at" IS NULL AND "status" IN ('PENDING', 'STORED', 'EXCEPTION');

-- SEC-9: protect tenant-scoped RBAC tables before tenant role management exists.
ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "role_tenant_isolation" ON "Role";
CREATE POLICY "role_tenant_isolation" ON "Role"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER TABLE "Role" FORCE ROW LEVEL SECURITY;

ALTER TABLE "UserRole" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_role_tenant_isolation" ON "UserRole";
CREATE POLICY "user_role_tenant_isolation" ON "UserRole"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR (
      EXISTS (
        SELECT 1 FROM "User" u
        WHERE u."id" = "UserRole"."userId"
          AND u."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
      AND EXISTS (
        SELECT 1 FROM "Role" r
        WHERE r."id" = "UserRole"."roleId"
          AND r."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR (
      EXISTS (
        SELECT 1 FROM "User" u
        WHERE u."id" = "UserRole"."userId"
          AND u."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
      AND EXISTS (
        SELECT 1 FROM "Role" r
        WHERE r."id" = "UserRole"."roleId"
          AND r."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
    )
  );
ALTER TABLE "UserRole" FORCE ROW LEVEL SECURITY;

ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "role_permission_tenant_isolation" ON "RolePermission";
CREATE POLICY "role_permission_tenant_isolation" ON "RolePermission"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Role" r
      WHERE r."id" = "RolePermission"."roleId"
        AND r."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR EXISTS (
      SELECT 1 FROM "Role" r
      WHERE r."id" = "RolePermission"."roleId"
        AND r."tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    )
  );
ALTER TABLE "RolePermission" FORCE ROW LEVEL SECURITY;

-- SEC-10: make tenant write checks explicit and symmetric.
ALTER POLICY tenant_isolation_station ON "Station"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_user ON "User"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_shelves ON "shelves"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_slots ON "slots"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_parcels ON "parcels"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_parcel_events ON "parcel_events"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_pickup_authorizations ON "pickup_authorizations"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_notifications ON "notifications"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_notify_templates ON "notify_templates"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" IS NULL
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_ship_orders ON "ship_orders"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_price_rules ON "price_rules"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_payments ON "payments"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_logistics_tracks ON "logistics_tracks"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_exceptions ON "exceptions"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_coupon_templates ON "coupon_templates"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_coupons ON "coupons"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_reviews ON "reviews"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_complaints ON "complaints"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_metric_daily ON "metric_daily"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_report_jobs ON "report_jobs"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_subscriptions ON "subscriptions"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_usage_records ON "usage_records"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_usage_dedup ON "usage_dedup"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY tenant_isolation_invoices ON "invoices"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
ALTER POLICY "ocr_recognitions_tenant_isolation" ON "ocr_recognitions"
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );
