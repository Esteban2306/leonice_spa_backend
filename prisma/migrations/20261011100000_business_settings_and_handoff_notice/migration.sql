-- AlterEnum
ALTER TYPE "AutomationExecutionType" ADD VALUE 'ADMIN_HANDOFF_NOTICE';

-- CreateTable
CREATE TABLE "business_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "deposit_amount" INTEGER,
    "deposit_instructions" TEXT,
    "deposit_policy" TEXT,
    "cancellation_policy" TEXT,
    "address" TEXT,
    "additional_info" TEXT,
    "updated_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);

