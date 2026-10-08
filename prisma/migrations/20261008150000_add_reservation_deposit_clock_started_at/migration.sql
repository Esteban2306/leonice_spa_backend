-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "deposit_clock_started_at" TIMESTAMP(3);

UPDATE "reservations"
SET "deposit_clock_started_at" = "deposit_expires_at" - INTERVAL '2 hours'
WHERE "deposit_expires_at" IS NOT NULL;
