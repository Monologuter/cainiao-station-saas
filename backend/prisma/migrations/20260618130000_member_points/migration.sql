-- CreateEnum
CREATE TYPE "PointRecordType" AS ENUM ('PICKUP', 'SHIP', 'CHECKIN', 'COUPON_REDEEM', 'EXPIRE', 'ADJUST', 'REFUND');

-- CreateTable
CREATE TABLE "consumers" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "consumer_id" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "level" SMALLINT NOT NULL DEFAULT 0,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "available_points" INTEGER NOT NULL DEFAULT 0,
    "frozen_points" INTEGER NOT NULL DEFAULT 0,
    "continuous_checkin_days" INTEGER NOT NULL DEFAULT 0,
    "last_checkin_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_records" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "change" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "type" "PointRecordType" NOT NULL,
    "source_tenant_id" UUID,
    "ref_type" VARCHAR(32),
    "ref_id" VARCHAR(64),
    "idempotency_key" VARCHAR(128) NOT NULL,
    "remark" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consumers_phone_key" ON "consumers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "members_consumer_id_key" ON "members"("consumer_id");

-- CreateIndex
CREATE UNIQUE INDEX "members_phone_key" ON "members"("phone");

-- CreateIndex
CREATE INDEX "members_level_idx" ON "members"("level");

-- CreateIndex
CREATE UNIQUE INDEX "point_records_idempotency_key_key" ON "point_records"("idempotency_key");

-- CreateIndex
CREATE INDEX "point_records_member_id_created_at_idx" ON "point_records"("member_id", "created_at");

-- CreateIndex
CREATE INDEX "point_records_source_tenant_id_idx" ON "point_records"("source_tenant_id");

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_consumer_id_fkey" FOREIGN KEY ("consumer_id") REFERENCES "consumers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_records" ADD CONSTRAINT "point_records_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
