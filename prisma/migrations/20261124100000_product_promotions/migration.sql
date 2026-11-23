ALTER TABLE "promotions" ADD COLUMN "product_id" TEXT;
ALTER TABLE "promotions" ADD COLUMN "product_category_id" TEXT;

CREATE INDEX "promotions_product_id_idx" ON "promotions"("product_id");
CREATE INDEX "promotions_product_category_id_idx" ON "promotions"("product_category_id");

ALTER TABLE "promotions" ADD CONSTRAINT "promotions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_product_category_id_fkey" FOREIGN KEY ("product_category_id") REFERENCES "product_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
