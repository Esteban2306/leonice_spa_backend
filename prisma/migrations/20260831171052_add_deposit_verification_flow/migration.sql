/*
  Warnings:

  - You are about to drop the column `amount` on the `deposit_records` table. All the data in the column will be lost.
  - You are about to drop the column `reference` on the `deposit_records` table. All the data in the column will be lost.
  - Added the required column `image_cloudinary_id` to the `deposit_records` table without a default value. This is not possible if the table is not empty.
  - Added the required column `image_url` to the `deposit_records` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DepositCoverage" AS ENUM ('ANTICIPO', 'PAGO_COMPLETO');

-- AlterTable
ALTER TABLE "deposit_records" DROP COLUMN "amount",
DROP COLUMN "reference",
ADD COLUMN     "coverage" "DepositCoverage",
ADD COLUMN     "image_cloudinary_id" TEXT NOT NULL,
ADD COLUMN     "image_url" TEXT NOT NULL,
ADD COLUMN     "rejection_reason" TEXT;

-- CreateIndex
CREATE INDEX "deposit_records_reservation_id_created_at_idx" ON "deposit_records"("reservation_id", "created_at");
