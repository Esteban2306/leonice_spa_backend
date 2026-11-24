-- CreateEnum
CREATE TYPE "ProductFulfillment" AS ENUM ('DOMICILIO', 'RECOGER');

-- CreateEnum
CREATE TYPE "ProductPaymentMethod" AS ENUM ('TRANSFERENCIA', 'CONTRAENTREGA', 'EN_TIENDA');

-- AlterTable
ALTER TABLE "product_orders" ADD COLUMN     "fulfillment" "ProductFulfillment",
ADD COLUMN     "payment_method" "ProductPaymentMethod",
ADD COLUMN     "delivery_address" TEXT;

-- AlterTable
ALTER TABLE "business_settings" ADD COLUMN     "product_delivery_info" TEXT;
