-- CreateEnum
CREATE TYPE "AiActorType" AS ENUM ('CONSUMER', 'STAFF');

-- CreateEnum
CREATE TYPE "AiChannel" AS ENUM ('USER_APP', 'STATION_WEB');

-- CreateEnum
CREATE TYPE "AiAssistantMode" AS ENUM ('MOCK', 'REAL');

-- CreateEnum
CREATE TYPE "AiConversationStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL');

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "consumer_id" UUID,
    "staff_user_id" UUID,
    "actor_type" "AiActorType" NOT NULL,
    "channel" "AiChannel" NOT NULL,
    "mode" "AiAssistantMode" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "status" "AiConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tool_name" VARCHAR(80),
    "tool_payload" JSONB,
    "citations" JSONB,
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "latency_ms" INTEGER,
    "seq" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversations_tenant_id_consumer_id_last_active_at_idx" ON "ai_conversations"("tenant_id", "consumer_id", "last_active_at");

-- CreateIndex
CREATE INDEX "ai_conversations_tenant_id_staff_user_id_last_active_at_idx" ON "ai_conversations"("tenant_id", "staff_user_id", "last_active_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_messages_conversation_id_seq_key" ON "ai_messages"("conversation_id", "seq");

-- CreateIndex
CREATE INDEX "ai_messages_tenant_id_conversation_id_seq_idx" ON "ai_messages"("tenant_id", "conversation_id", "seq");

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_conversations" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_conversations_tenant_isolation" ON "ai_conversations"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE "ai_conversations" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ai_messages" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_messages_tenant_isolation" ON "ai_messages"
  USING (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'on'
    OR "tenant_id" = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

ALTER TABLE "ai_messages" FORCE ROW LEVEL SECURITY;
