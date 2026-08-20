-- CreateTable
CREATE TABLE "treatment_product_recommendations" (
    "id" TEXT NOT NULL,
    "treatment_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_product_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "treatment_product_recommendations_treatment_id_product_id_key" ON "treatment_product_recommendations"("treatment_id", "product_id");

-- AddForeignKey
ALTER TABLE "treatment_product_recommendations" ADD CONSTRAINT "treatment_product_recommendations_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_product_recommendations" ADD CONSTRAINT "treatment_product_recommendations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
