-- CreateTable
CREATE TABLE "client_dependents" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_dependents_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN "dependent_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "client_dependents_client_id_name_key_birth_date_key" ON "client_dependents"("client_id", "name_key", "birth_date");

-- CreateIndex
CREATE INDEX "reservations_dependent_id_idx" ON "reservations"("dependent_id");

-- AddForeignKey
ALTER TABLE "client_dependents" ADD CONSTRAINT "client_dependents_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "client_dependents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
