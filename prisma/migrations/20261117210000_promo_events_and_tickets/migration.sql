-- AlterEnum


ALTER TYPE "AutomationExecutionType" ADD VALUE IF NOT EXISTS 'CLIENT_EVENT_TICKET_NOTICE';
ALTER TYPE "AutomationExecutionType" ADD VALUE IF NOT EXISTS 'CLIENT_EVENT_WINNER_NOTICE';

-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "event_id" TEXT;

-- CreateTable
CREATE TABLE "promo_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "prizes" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "tickets_enabled" BOOLEAN NOT NULL DEFAULT false,
    "next_ticket_number" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_tickets" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "reservation_id" TEXT,
    "visit_key" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "won_at" TIMESTAMP(3),
    "prize" TEXT,
    "drawn_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promo_events_is_active_starts_at_ends_at_idx" ON "promo_events"("is_active", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "event_tickets_client_id_idx" ON "event_tickets"("client_id");

-- CreateIndex
CREATE INDEX "event_tickets_event_id_won_at_idx" ON "event_tickets"("event_id", "won_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_tickets_event_id_number_key" ON "event_tickets"("event_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "event_tickets_event_id_visit_key_key" ON "event_tickets"("event_id", "visit_key");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "promo_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "promo_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_tickets" ADD CONSTRAINT "event_tickets_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

