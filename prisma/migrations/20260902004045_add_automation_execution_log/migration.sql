-- CreateEnum
CREATE TYPE "AutomationExecutionType" AS ENUM ('VALORACION_TIMEOUT', 'DEPOSITO_TIMEOUT', 'NO_SHOW_CHECK', 'RESERVATION_REMINDER', 'REACTIVATION');

-- CreateEnum
CREATE TYPE "AutomationExecutionResult" AS ENUM ('EXECUTED', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "automation_executions" (
    "id" TEXT NOT NULL,
    "type" "AutomationExecutionType" NOT NULL,
    "result" "AutomationExecutionResult" NOT NULL,
    "reservation_id" TEXT,
    "client_id" TEXT,
    "automation_rule_id" TEXT,
    "reason" TEXT,
    "error_message" TEXT,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_executions_type_executed_at_idx" ON "automation_executions"("type", "executed_at");

-- CreateIndex
CREATE INDEX "automation_executions_reservation_id_idx" ON "automation_executions"("reservation_id");

-- CreateIndex
CREATE INDEX "automation_executions_client_id_idx" ON "automation_executions"("client_id");
