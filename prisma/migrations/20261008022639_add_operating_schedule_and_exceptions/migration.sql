-- CreateEnum
CREATE TYPE "ScheduleExceptionType" AS ENUM ('BLOCK', 'OPEN');

-- CreateTable
CREATE TABLE "operating_windows" (
    "id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operating_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_exceptions" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "ScheduleExceptionType" NOT NULL,
    "category_id" TEXT,
    "start_minute" INTEGER,
    "end_minute" INTEGER,
    "reason" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operating_windows_day_of_week_start_minute_key" ON "operating_windows"("day_of_week", "start_minute");

-- CreateIndex
CREATE INDEX "schedule_exceptions_date_idx" ON "schedule_exceptions"("date");

-- AddForeignKey
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


INSERT INTO "operating_windows" ("id", "day_of_week", "start_minute", "end_minute", "updated_at")
SELECT gen_random_uuid()::text, d.day, w.start_minute, w.end_minute, CURRENT_TIMESTAMP
FROM (VALUES (1), (2), (3), (4), (5)) AS d(day)
CROSS JOIN (VALUES (480, 720), (840, 960)) AS w(start_minute, end_minute)
UNION ALL
SELECT gen_random_uuid()::text, d.day, w.start_minute, w.end_minute, CURRENT_TIMESTAMP
FROM (VALUES (0), (6)) AS d(day)
CROSS JOIN (VALUES (420, 720), (840, 960)) AS w(start_minute, end_minute);
