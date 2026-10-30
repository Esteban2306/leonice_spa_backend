-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'MIXTO');

-- CreateEnum
CREATE TYPE "SiigoSyncStatus" AS ENUM ('PENDIENTE', 'ENVIANDO', 'SINCRONIZADO', 'FALLIDO', 'BLOQUEADO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AutomationExecutionType" ADD VALUE 'CLIENT_RESERVATION_CONFIRMED_NOTICE';
ALTER TYPE "AutomationExecutionType" ADD VALUE 'CLIENT_CANCELLED_BY_ADMIN_NOTICE';

-- CreateTable
CREATE TABLE "reservation_payments" (
    "id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "advance_amount" DECIMAL(10,2) NOT NULL,
    "cash_amount" DECIMAL(10,2) NOT NULL,
    "transfer_amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "recorded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "siigo_syncs" (
    "id" TEXT NOT NULL,
    "reservation_id" TEXT NOT NULL,
    "status" "SiigoSyncStatus" NOT NULL DEFAULT 'PENDIENTE',
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "siigo_document_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "synced_at" TIMESTAMP(3),

    CONSTRAINT "siigo_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reservation_payments_reservation_id_key" ON "reservation_payments"("reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "siigo_syncs_reservation_id_key" ON "siigo_syncs"("reservation_id");

-- CreateIndex
CREATE INDEX "siigo_syncs_status_created_at_idx" ON "siigo_syncs"("status", "created_at");

-- AddForeignKey
ALTER TABLE "reservation_payments" ADD CONSTRAINT "reservation_payments_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_payments" ADD CONSTRAINT "reservation_payments_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "siigo_syncs" ADD CONSTRAINT "siigo_syncs_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

