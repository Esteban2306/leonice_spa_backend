-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "covered_by_deposit_id" TEXT;

-- CreateIndex
CREATE INDEX "reservations_covered_by_deposit_id_idx" ON "reservations"("covered_by_deposit_id");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_covered_by_deposit_id_fkey" FOREIGN KEY ("covered_by_deposit_id") REFERENCES "deposit_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

