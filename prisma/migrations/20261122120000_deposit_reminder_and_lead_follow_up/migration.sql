ALTER TYPE "AutomationExecutionType" ADD VALUE 'CLIENT_DEPOSIT_REMINDER';
ALTER TYPE "AutomationExecutionType" ADD VALUE 'CLIENT_LEAD_FOLLOW_UP';

ALTER TABLE "business_settings" ADD COLUMN "deposit_reminder_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "business_settings" ADD COLUMN "lead_follow_up_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "clients" ADD COLUMN "lead_follow_up_sent_at" TIMESTAMP(3);
