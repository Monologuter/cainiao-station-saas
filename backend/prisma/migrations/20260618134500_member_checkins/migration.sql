-- CreateTable
CREATE TABLE "member_checkins" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "checkin_date" DATE NOT NULL,
    "reward_points" INTEGER NOT NULL,
    "continuous_days" INTEGER NOT NULL,
    "point_record_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_checkins_point_record_id_key" ON "member_checkins"("point_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "member_checkins_member_id_checkin_date_key" ON "member_checkins"("member_id", "checkin_date");

-- AddForeignKey
ALTER TABLE "member_checkins" ADD CONSTRAINT "member_checkins_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_checkins" ADD CONSTRAINT "member_checkins_point_record_id_fkey" FOREIGN KEY ("point_record_id") REFERENCES "point_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
