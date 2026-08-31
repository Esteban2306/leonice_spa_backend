-- AlterTable
ALTER TABLE "treatments" ADD COLUMN     "has_hair_variable_pricing" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "treatment_hair_length_pricing" (
    "id" TEXT NOT NULL,
    "treatment_id" TEXT NOT NULL,
    "hair_length" "HairLength" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_hair_length_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_hair_color_surcharge" (
    "id" TEXT NOT NULL,
    "treatment_id" TEXT NOT NULL,
    "hair_color" "HairColor" NOT NULL,
    "surcharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "extra_duration_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treatment_hair_color_surcharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "treatment_hair_length_pricing_treatment_id_idx" ON "treatment_hair_length_pricing"("treatment_id");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_hair_length_pricing_treatment_id_hair_length_key" ON "treatment_hair_length_pricing"("treatment_id", "hair_length");

-- CreateIndex
CREATE INDEX "treatment_hair_color_surcharge_treatment_id_idx" ON "treatment_hair_color_surcharge"("treatment_id");

-- CreateIndex
CREATE UNIQUE INDEX "treatment_hair_color_surcharge_treatment_id_hair_color_key" ON "treatment_hair_color_surcharge"("treatment_id", "hair_color");

-- AddForeignKey
ALTER TABLE "treatment_hair_length_pricing" ADD CONSTRAINT "treatment_hair_length_pricing_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_hair_color_surcharge" ADD CONSTRAINT "treatment_hair_color_surcharge_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "treatments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
