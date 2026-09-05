-- CreateEnum
CREATE TYPE "ConduitOutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "conduit_outbox_events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "ConduitOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "conduit_outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conduit_outbox_events_status_created_at_idx" ON "conduit_outbox_events"("status", "created_at");
