-- AlterTable
ALTER TABLE "deposit_records" ADD COLUMN     "amount" DECIMAL(10,2),
ADD COLUMN     "applied_to_reservation_id" TEXT;

-- CreateIndex
CREATE INDEX "deposit_records_applied_to_reservation_id_idx" ON "deposit_records"("applied_to_reservation_id");

-- AddForeignKey
ALTER TABLE "deposit_records" ADD CONSTRAINT "deposit_records_applied_to_reservation_id_fkey" FOREIGN KEY ("applied_to_reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
