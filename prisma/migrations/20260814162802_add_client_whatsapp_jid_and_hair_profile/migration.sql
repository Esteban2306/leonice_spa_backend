/*
  Warnings:

  - You are about to drop the column `hair_color` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hair_length` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hair_profile_updated_at` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `whatsapp_jid` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[whatsapp_jid]` on the table `clients` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "users_whatsapp_jid_key";

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "hair_color" "HairColor",
ADD COLUMN     "hair_length" "HairLength",
ADD COLUMN     "hair_profile_updated_at" TIMESTAMP(3),
ADD COLUMN     "whatsapp_jid" TEXT;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "hair_color",
DROP COLUMN "hair_length",
DROP COLUMN "hair_profile_updated_at",
DROP COLUMN "whatsapp_jid";

-- CreateIndex
CREATE UNIQUE INDEX "clients_whatsapp_jid_key" ON "clients"("whatsapp_jid");
