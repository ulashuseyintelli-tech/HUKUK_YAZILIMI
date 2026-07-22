-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "actorType" TEXT,
ADD COLUMN     "correlationId" TEXT,
ADD COLUMN     "decisionResult" TEXT,
ADD COLUMN     "policyRef" TEXT,
ADD COLUMN     "policyVersion" TEXT,
ADD COLUMN     "reasonCode" TEXT,
ADD COLUMN     "requestId" TEXT;
