-- DropIndex
DROP INDEX "deposit_records_reservation_id_key";

-- AlterTable
ALTER TABLE "deposit_records" ALTER COLUMN "image_cloudinary_id" DROP NOT NULL,
ALTER COLUMN "image_url" DROP NOT NULL;
