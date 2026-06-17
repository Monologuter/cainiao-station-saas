-- Seed onboarding notification templates. Platform-level templates are tenant_id NULL.
INSERT INTO "notify_templates" ("id", "tenant_id", "code", "channel", "content", "enabled", "created_at", "updated_at")
SELECT gen_random_uuid(), NULL, 'TENANT_APPROVED', 'IN_APP',
       '入驻申请已通过，店长账号 {username}，套餐 {planCode}，请尽快完成首次登录。',
       true, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "notify_templates"
  WHERE "tenant_id" IS NULL AND "code" = 'TENANT_APPROVED' AND "channel" = 'IN_APP'
);

INSERT INTO "notify_templates" ("id", "tenant_id", "code", "channel", "content", "enabled", "created_at", "updated_at")
SELECT gen_random_uuid(), NULL, 'TENANT_APPROVED', 'SMS',
       '【菜鸟驿站】入驻已通过，店长账号{username}，初始密码{tempPassword}，请登录后尽快修改。',
       true, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "notify_templates"
  WHERE "tenant_id" IS NULL AND "code" = 'TENANT_APPROVED' AND "channel" = 'SMS'
);

INSERT INTO "notify_templates" ("id", "tenant_id", "code", "channel", "content", "enabled", "created_at", "updated_at")
SELECT gen_random_uuid(), NULL, 'APPLICATION_REJECTED', 'SMS',
       '【菜鸟驿站】入驻申请未通过，原因：{reason}。请补充材料后重新提交。',
       true, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "notify_templates"
  WHERE "tenant_id" IS NULL AND "code" = 'APPLICATION_REJECTED' AND "channel" = 'SMS'
);
