/*
  Warnings:

  - A unique constraint covering the columns `[whatsapp_jid]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "HairLength" AS ENUM ('CORTO', 'MEDIANO', 'LARGO');

-- CreateEnum
CREATE TYPE "HairColor" AS ENUM ('CLARO', 'OSCURO');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "hair_color" "HairColor",
ADD COLUMN     "hair_length" "HairLength",
ADD COLUMN     "hair_profile_updated_at" TIMESTAMP(3),
ADD COLUMN     "whatsapp_jid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_whatsapp_jid_key" ON "users"("whatsapp_jid");
