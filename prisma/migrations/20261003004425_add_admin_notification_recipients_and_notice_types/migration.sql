-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AutomationExecutionType" ADD VALUE 'ADMIN_DEPOSIT_TIMEOUT_NOTICE';
ALTER TYPE "AutomationExecutionType" ADD VALUE 'CLIENT_DEPOSIT_REJECTED_NOTICE';
ALTER TYPE "AutomationExecutionType" ADD VALUE 'CLIENT_RESCHEDULE_NOTICE';
ALTER TYPE "AutomationExecutionType" ADD VALUE 'ADMIN_RESCHEDULE_NOTICE';

-- CreateTable
CREATE TABLE "admin_notification_recipients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_notification_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_notification_recipients_phone_key" ON "admin_notification_recipients"("phone");
