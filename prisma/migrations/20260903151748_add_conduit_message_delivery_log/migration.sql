-- CreateEnum
CREATE TYPE "ConduitMessageStatus" AS ENUM ('SENT', 'FAILED', 'DEAD', 'CANCELLED');

-- CreateTable
CREATE TABLE "conduit_message_delivery_logs" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "status" "ConduitMessageStatus" NOT NULL,
    "channel" TEXT,
    "recipient" TEXT,
    "provider" TEXT,
    "provider_message_id" TEXT,
    "error_message" TEXT,
    "company_event_id" TEXT,
    "raw_payload" JSONB NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conduit_message_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conduit_message_delivery_logs_company_event_id_idx" ON "conduit_message_delivery_logs"("company_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "conduit_message_delivery_logs_message_id_status_key" ON "conduit_message_delivery_logs"("message_id", "status");
