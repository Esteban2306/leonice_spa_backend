-- CreateEnum
CREATE TYPE "ProductOrderStatus" AS ENUM ('PENDIENTE_PAGO', 'PAGO_EN_REVISION', 'PAGADO', 'ENTREGADO', 'CANCELADO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AutomationExecutionType" ADD VALUE 'ADMIN_PRODUCT_PAYMENT_NOTICE';
ALTER TYPE "AutomationExecutionType" ADD VALUE 'CLIENT_PRODUCT_PAYMENT_VERIFIED_NOTICE';
ALTER TYPE "AutomationExecutionType" ADD VALUE 'CLIENT_PRODUCT_PAYMENT_REJECTED_NOTICE';

-- AlterTable
ALTER TABLE "business_settings" ADD COLUMN     "product_payment_instructions" TEXT;

-- CreateTable
CREATE TABLE "product_orders" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "status" "ProductOrderStatus" NOT NULL DEFAULT 'PENDIENTE_PAGO',
    "client_id" TEXT,
    "phone" TEXT,
    "lid" TEXT,
    "client_name" TEXT,
    "request" TEXT,
    "notes" TEXT,
    "total" DECIMAL(12,2),
    "price_held_until" TIMESTAMP(3) NOT NULL,
    "proof_image_url" TEXT,
    "proof_cloudinary_id" TEXT,
    "proof_amount" DECIMAL(12,2),
    "proof_received_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "verified_at" TIMESTAMP(3),
    "verified_by_user_id" TEXT,
    "delivered_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "variant_id" TEXT,
    "product_name" TEXT NOT NULL,
    "presentation" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2),
    "promo_price" DECIMAL(12,2),
    "promotion" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_orders_number_key" ON "product_orders"("number");

-- CreateIndex
CREATE INDEX "product_orders_status_created_at_idx" ON "product_orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "product_orders_phone_status_idx" ON "product_orders"("phone", "status");

-- CreateIndex
CREATE INDEX "product_orders_lid_status_idx" ON "product_orders"("lid", "status");

-- CreateIndex
CREATE INDEX "product_order_items_order_id_idx" ON "product_order_items"("order_id");

-- AddForeignKey
ALTER TABLE "product_orders" ADD CONSTRAINT "product_orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_order_items" ADD CONSTRAINT "product_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "product_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_order_items" ADD CONSTRAINT "product_order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

