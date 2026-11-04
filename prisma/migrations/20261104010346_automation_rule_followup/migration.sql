-- AlterTable
ALTER TABLE "automation_rules" ADD COLUMN     "template_code" TEXT,
ALTER COLUMN "reactivation_days" DROP NOT NULL;
