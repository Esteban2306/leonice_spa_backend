-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('SINGLE', 'COMBO');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "kind" "ProductKind" NOT NULL DEFAULT 'SINGLE';

-- CreateTable
CREATE TABLE "product_combo_items" (
    "id" TEXT NOT NULL,
    "combo_product_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_combo_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_combo_items_variant_id_idx" ON "product_combo_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_combo_items_combo_product_id_variant_id_key" ON "product_combo_items"("combo_product_id", "variant_id");

-- CreateIndex
CREATE INDEX "products_kind_idx" ON "products"("kind");

-- AddForeignKey
ALTER TABLE "product_combo_items" ADD CONSTRAINT "product_combo_items_combo_product_id_fkey" FOREIGN KEY ("combo_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_combo_items" ADD CONSTRAINT "product_combo_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddCheckConstraint
ALTER TABLE "product_combo_items" ADD CONSTRAINT "product_combo_items_quantity_positive" CHECK ("quantity" > 0);

-- SeedComboCategory
INSERT INTO "product_categories" ("id", "name", "slug", "description", "display_order", "is_active")
VALUES (
    gen_random_uuid()::text,
    'Combos',
    'combos',
    'Rituales completos para continuar tu tratamiento en casa, con precio especial frente a comprar cada producto por separado.',
    -1,
    true
)
ON CONFLICT DO NOTHING;
