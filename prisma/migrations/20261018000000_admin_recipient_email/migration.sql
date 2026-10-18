ALTER TABLE "admin_notification_recipients" ADD COLUMN "email" TEXT;

ALTER TABLE "admin_notification_recipients"
  ADD CONSTRAINT "admin_notification_recipients_email_check"
  CHECK ("email" IS NULL OR ("email" = lower("email") AND length("email") <= 254 AND position('@' in "email") > 1));
