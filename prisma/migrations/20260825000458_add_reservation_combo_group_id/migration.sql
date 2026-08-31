-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "combo_group_id" TEXT;

-- CreateIndex
CREATE INDEX "reservations_combo_group_id_idx" ON "reservations"("combo_group_id");
