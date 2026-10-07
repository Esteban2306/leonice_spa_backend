-- CreateEnum
CREATE TYPE "CancellationSource" AS ENUM ('CLIENT', 'ADMIN', 'TIMEOUT');

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "cancellation_source" "CancellationSource";
