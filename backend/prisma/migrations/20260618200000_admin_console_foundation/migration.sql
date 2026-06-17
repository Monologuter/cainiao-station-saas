-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('PLATFORM', 'STAFF', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "ConfigValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "actor_id" UUID,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_name" VARCHAR(80),
    "action" VARCHAR(80) NOT NULL,
    "resource_type" VARCHAR(80) NOT NULL,
    "resource_id" VARCHAR(80),
    "result" "AuditResult" NOT NULL,
    "summary" VARCHAR(500),
    "before" JSONB,
    "after" JSONB,
    "diff" JSONB,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(300),
    "request_id" VARCHAR(80),
    "error_code" VARCHAR(60),
    "error_message" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionaries" (
    "id" UUID NOT NULL,
    "type" VARCHAR(60) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(255),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dictionaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dict_items" (
    "id" UUID NOT NULL,
    "dictionary_id" UUID NOT NULL,
    "code" VARCHAR(80) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "value" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "remark" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dict_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" UUID NOT NULL,
    "config_key" VARCHAR(100) NOT NULL,
    "group" VARCHAR(60) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "value" JSONB,
    "default_value" JSONB,
    "value_type" "ConfigValueType" NOT NULL DEFAULT 'STRING',
    "editable" BOOLEAN NOT NULL DEFAULT true,
    "secret" BOOLEAN NOT NULL DEFAULT false,
    "description" VARCHAR(255),
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_configs" (
    "id" UUID NOT NULL,
    "channel" VARCHAR(40) NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "fallback_provider" VARCHAR(40),
    "config" JSONB NOT NULL DEFAULT '{}',
    "description" VARCHAR(255),
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_configs_pkey" PRIMARY KEY ("id")
);

COMMENT ON TABLE "dictionaries" IS 'platform-level dictionary table; intentionally does not use tenant RLS because values are global configuration';
COMMENT ON TABLE "dict_items" IS 'platform-level dictionary item table; intentionally does not use tenant RLS because values are global configuration';
COMMENT ON TABLE "system_configs" IS 'platform-level system configuration table; intentionally does not use tenant RLS because values are global configuration';
COMMENT ON TABLE "channel_configs" IS 'platform-level channel switch table; intentionally does not use tenant RLS because values are global configuration';

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_result_created_at_idx" ON "audit_logs"("result", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "dictionaries_type_key" ON "dictionaries"("type");

-- CreateIndex
CREATE INDEX "dictionaries_enabled_sort_idx" ON "dictionaries"("enabled", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "dict_items_dictionary_id_code_key" ON "dict_items"("dictionary_id", "code");

-- CreateIndex
CREATE INDEX "dict_items_dictionary_id_enabled_sort_idx" ON "dict_items"("dictionary_id", "enabled", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_config_key_key" ON "system_configs"("config_key");

-- CreateIndex
CREATE INDEX "system_configs_group_idx" ON "system_configs"("group");

-- CreateIndex
CREATE UNIQUE INDEX "channel_configs_channel_key" ON "channel_configs"("channel");

-- CreateIndex
CREATE INDEX "channel_configs_enabled_idx" ON "channel_configs"("enabled");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dict_items" ADD CONSTRAINT "dict_items_dictionary_id_fkey" FOREIGN KEY ("dictionary_id") REFERENCES "dictionaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_tenant_isolation ON "audit_logs"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

-- Seed platform permissions.
INSERT INTO "Permission" ("id", "code", "name", "module")
VALUES
  (gen_random_uuid(), 'monitor:view', '查看平台监控', 'monitor'),
  (gen_random_uuid(), 'audit:view', '查看操作审计', 'audit'),
  (gen_random_uuid(), 'config:view', '查看系统配置', 'config'),
  (gen_random_uuid(), 'config:manage', '管理系统配置', 'config')
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name", "module" = EXCLUDED."module";

-- Grant new permissions to the built-in platform super admin role.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('monitor:view', 'audit:view', 'config:view', 'config:manage')
WHERE r."tenant_id" IS NULL AND r."code" = '平台超管'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- Seed dictionaries.
INSERT INTO "dictionaries" ("id", "type", "name", "description", "enabled", "sort", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'courier_company', '快递公司', '快递和物流公司枚举', true, 10, now(), now()),
  (gen_random_uuid(), 'parcel_size', '包裹规格', '包裹体积规格枚举', true, 20, now(), now()),
  (gen_random_uuid(), 'exception_type', '异常类型', '异常件处理类型枚举', true, 30, now(), now()),
  (gen_random_uuid(), 'notify_scene', '通知场景', '通知模板业务场景枚举', true, 40, now(), now())
ON CONFLICT ("type") DO UPDATE
SET "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "enabled" = EXCLUDED."enabled",
    "sort" = EXCLUDED."sort",
    "updated_at" = now();

INSERT INTO "dict_items" ("id", "dictionary_id", "code", "label", "value", "enabled", "sort", "created_at", "updated_at")
SELECT gen_random_uuid(), d."id", item."code", item."label", item."value"::jsonb, true, item."sort", now(), now()
FROM "dictionaries" d
JOIN (
  VALUES
    ('courier_company', 'SF', '顺丰速运', '{"shortName":"顺丰"}', 10),
    ('courier_company', 'YTO', '圆通速递', '{"shortName":"圆通"}', 20),
    ('courier_company', 'ZTO', '中通快递', '{"shortName":"中通"}', 30),
    ('courier_company', 'STO', '申通快递', '{"shortName":"申通"}', 40),
    ('parcel_size', 'SMALL', '小件', '{"maxWeightGram":1000}', 10),
    ('parcel_size', 'MEDIUM', '中件', '{"maxWeightGram":5000}', 20),
    ('parcel_size', 'LARGE', '大件', '{"maxWeightGram":20000}', 30),
    ('exception_type', 'DAMAGED', '破损', '{}', 10),
    ('exception_type', 'MISDELIVERED', '错投', '{}', 20),
    ('exception_type', 'UNCLAIMED', '滞留未取', '{}', 30),
    ('exception_type', 'REJECTED', '拒收', '{}', 40),
    ('exception_type', 'OVERSIZED', '超规格', '{}', 50),
    ('notify_scene', 'PARCEL_STORED', '包裹入库', '{}', 10),
    ('notify_scene', 'OVERDUE_REMIND', '滞留提醒', '{}', 20),
    ('notify_scene', 'OVERDUE_URGE', '滞留催领', '{}', 30),
    ('notify_scene', 'OVERDUE_FINAL', '退回预警', '{}', 40),
    ('notify_scene', 'TENANT_APPROVED', '入驻通过', '{}', 50),
    ('notify_scene', 'APPLICATION_REJECTED', '入驻驳回', '{}', 60)
) AS item("type", "code", "label", "value", "sort") ON item."type" = d."type"
ON CONFLICT ("dictionary_id", "code") DO UPDATE
SET "label" = EXCLUDED."label",
    "value" = EXCLUDED."value",
    "enabled" = EXCLUDED."enabled",
    "sort" = EXCLUDED."sort",
    "updated_at" = now();

-- Seed system configs.
INSERT INTO "system_configs" ("id", "config_key", "group", "name", "value", "default_value", "value_type", "editable", "secret", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'notify.sms.daily_limit', 'notify', '短信日发送上限', '5000'::jsonb, '5000'::jsonb, 'NUMBER', true, false, '单租户每日短信发送上限', now(), now()),
  (gen_random_uuid(), 'monitor.exception.warn_threshold', 'monitor', '异常预警阈值', '10'::jsonb, '10'::jsonb, 'NUMBER', true, false, '门店异常件数达到该值后标记预警', now(), now()),
  (gen_random_uuid(), 'security.jwt.expires_in', 'security', 'JWT 过期时间', '"7d"'::jsonb, '"7d"'::jsonb, 'STRING', false, false, '访问令牌过期时间，由环境变量优先覆盖', now(), now())
ON CONFLICT ("config_key") DO UPDATE
SET "group" = EXCLUDED."group",
    "name" = EXCLUDED."name",
    "default_value" = EXCLUDED."default_value",
    "value_type" = EXCLUDED."value_type",
    "editable" = EXCLUDED."editable",
    "secret" = EXCLUDED."secret",
    "description" = EXCLUDED."description",
    "updated_at" = now();

-- Seed channel switches. Real providers are placeholders before P4-4.
INSERT INTO "channel_configs" ("id", "channel", "provider", "enabled", "fallback_provider", "config", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'sms', 'mock', true, 'mock', '{"registeredProviders":["mock","tencent"]}'::jsonb, '短信发送渠道', now(), now()),
  (gen_random_uuid(), 'pay', 'mock', true, 'mock', '{"registeredProviders":["mock","wechat"]}'::jsonb, '支付渠道', now(), now()),
  (gen_random_uuid(), 'logistics', 'mock', true, 'mock', '{"registeredProviders":["mock","kuaidi100"]}'::jsonb, '物流轨迹渠道', now(), now()),
  (gen_random_uuid(), 'ocr', 'mock', true, 'mock', '{"registeredProviders":["mock","provider"]}'::jsonb, 'OCR 识别渠道', now(), now()),
  (gen_random_uuid(), 'storage', 'mock', true, 'mock', '{"registeredProviders":["mock","minio"]}'::jsonb, '文件存储渠道', now(), now())
ON CONFLICT ("channel") DO UPDATE
SET "provider" = EXCLUDED."provider",
    "enabled" = EXCLUDED."enabled",
    "fallback_provider" = EXCLUDED."fallback_provider",
    "config" = EXCLUDED."config",
    "description" = EXCLUDED."description",
    "updated_at" = now();
