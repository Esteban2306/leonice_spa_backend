-- CreateEnum
CREATE TYPE "ClientTagKey" AS ENUM ('SIN_VISITAS', 'NUEVA', 'RECURRENTE', 'EN_PAUSA', 'INACTIVA', 'CON_CITA_PROXIMA', 'RESERVA_PENDIENTE', 'NO_SHOW_REITERADO', 'CUMPLE_PRONTO', 'FRECUENTA', 'REPITE_SERVICIO', 'APTA_PROMOCION');

-- CreateTable
CREATE TABLE "client_tags" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "key" "ClientTagKey" NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_tags_key_idx" ON "client_tags"("key");

-- CreateIndex
CREATE UNIQUE INDEX "client_tags_client_id_key_detail_key" ON "client_tags"("client_id", "key", "detail");

-- AddForeignKey
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
