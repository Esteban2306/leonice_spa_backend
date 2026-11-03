-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "template_code" TEXT NOT NULL,
    "promotion_id" TEXT,
    "audience" JSONB NOT NULL,
    "marketing" BOOLEAN NOT NULL DEFAULT true,
    "pace" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'RUNNING',
    "paused_reason" TEXT,
    "total_recipients" INTEGER NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "send_windows" JSONB NOT NULL,
    "max_per_day" INTEGER NOT NULL DEFAULT 90,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaign_recipients_campaign_id_status_scheduled_at_idx" ON "campaign_recipients"("campaign_id", "status", "scheduled_at");

-- CreateIndex
CREATE INDEX "campaign_recipients_status_scheduled_at_idx" ON "campaign_recipients"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "campaign_recipients_sent_at_idx" ON "campaign_recipients"("sent_at");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaign_id_client_id_key" ON "campaign_recipients"("campaign_id", "client_id");

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
