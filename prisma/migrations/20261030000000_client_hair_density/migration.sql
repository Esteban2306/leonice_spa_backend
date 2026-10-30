-- CreateEnum
CREATE TYPE "HairDensity" AS ENUM ('BAJA', 'MEDIA', 'ALTA');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN "hair_density" "HairDensity";
