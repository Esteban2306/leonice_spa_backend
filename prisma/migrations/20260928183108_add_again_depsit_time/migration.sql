-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "deposit_expires_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "reservations_status_deposit_expires_at_idx" ON "reservations"("status", "deposit_expires_at");
