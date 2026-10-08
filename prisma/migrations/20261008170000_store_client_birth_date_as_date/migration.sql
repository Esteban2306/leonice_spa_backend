-- AlterTable
ALTER TABLE "clients" ALTER COLUMN "birth_date" SET DATA TYPE DATE USING "birth_date"::date;
