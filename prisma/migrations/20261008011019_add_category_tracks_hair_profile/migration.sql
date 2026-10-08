-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "tracks_hair_profile" BOOLEAN NOT NULL DEFAULT false;


UPDATE "categories" SET "tracks_hair_profile" = true WHERE "name" = 'Spa Capilar';
