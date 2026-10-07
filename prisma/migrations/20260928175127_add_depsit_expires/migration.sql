/*
  Warnings:

  - You are about to drop the column `deposit_expires_at` on the `reservations` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "reservations_status_deposit_expires_at_idx";

-- AlterTable
ALTER TABLE "reservations" DROP COLUMN "deposit_expires_at";
