CREATE TABLE "schedule_day_overrides" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "windows" JSONB NOT NULL DEFAULT '[]',
    "start_minutes" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "reason" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_day_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "schedule_day_overrides_date_key" ON "schedule_day_overrides"("date");
