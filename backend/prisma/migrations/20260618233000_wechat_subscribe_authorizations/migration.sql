ALTER TYPE "NotifyChannelType" ADD VALUE IF NOT EXISTS 'WECHAT';

CREATE TABLE "wechat_subscribe_authorizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "consumer_id" UUID NOT NULL,
    "openid" VARCHAR(128) NOT NULL,
    "template_id" VARCHAR(128) NOT NULL,
    "remaining_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "wechat_subscribe_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wechat_subscribe_authorizations_tenant_id_consumer_id_template_id_key"
    ON "wechat_subscribe_authorizations"("tenant_id", "consumer_id", "template_id");

CREATE INDEX "wechat_subscribe_authorizations_tenant_id_openid_idx"
    ON "wechat_subscribe_authorizations"("tenant_id", "openid");

ALTER TABLE "wechat_subscribe_authorizations"
    ADD CONSTRAINT "wechat_subscribe_authorizations_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wechat_subscribe_authorizations"
    ADD CONSTRAINT "wechat_subscribe_authorizations_consumer_id_fkey"
    FOREIGN KEY ("consumer_id") REFERENCES "consumers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "wechat_subscribe_authorizations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wechat_subscribe_authorizations_tenant_isolation"
    ON "wechat_subscribe_authorizations"
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR tenant_id::text = current_setting('app.tenant_id', true)
    )
    WITH CHECK (
        current_setting('app.bypass_rls', true) = 'on'
        OR tenant_id::text = current_setting('app.tenant_id', true)
    );

ALTER TABLE "wechat_subscribe_authorizations" FORCE ROW LEVEL SECURITY;
