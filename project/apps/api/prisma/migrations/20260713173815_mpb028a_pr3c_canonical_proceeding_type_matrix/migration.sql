-- CreateEnum
CREATE TYPE "ProceedingType" AS ENUM ('GENERAL_EXECUTION', 'CAMBIO', 'RENT', 'EVICTION', 'PLEDGE', 'MORTGAGE', 'BANKRUPTCY', 'JUDGMENT_ENFORCEMENT', 'PUBLIC_RECEIVABLE');

-- CreateEnum
CREATE TYPE "RentalType" AS ENUM ('RESIDENTIAL_COMMERCIAL', 'GENERAL', 'CROP', 'EVICTION_COMMITMENT');

-- CreateEnum
CREATE TYPE "BankruptcyType" AS ENUM ('ORDINARY', 'CAMBIO');

-- CreateEnum
CREATE TYPE "JudgmentExecutionType" AS ENUM ('MONEY_OR_SECURITY', 'MOVABLE_DELIVERY', 'IMMOVABLE_DELIVERY_OR_EVICTION', 'SPECIFIC_PERFORMANCE', 'MORTGAGE_JUDGMENT');

-- CreateEnum
CREATE TYPE "NextActionType" AS ENUM ('HACIZ_REQUEST_ELIGIBLE', 'SALE_REQUEST_ELIGIBLE', 'EVICTION_REQUEST_ELIGIBLE', 'BANKRUPTCY_REQUEST_ELIGIBLE', 'FORCED_DELIVERY_ELIGIBLE', 'FORCED_PERFORMANCE_ELIGIBLE', 'FINALIZATION_REQUEST_ELIGIBLE');

-- CreateEnum
CREATE TYPE "PreEnforcementProcessType" AS ENUM ('MTS');

-- CreateEnum
CREATE TYPE "PreEnforcementProcessStatus" AS ENUM ('ACTIVE', 'CLOSED', 'TRANSFERRED');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "bankruptcyType" "BankruptcyType",
ADD COLUMN     "judgmentExecutionType" "JudgmentExecutionType",
ADD COLUMN     "preEnforcementProcess" "PreEnforcementProcessType",
ADD COLUMN     "preEnforcementProcessStatus" "PreEnforcementProcessStatus",
ADD COLUMN     "proceedingType" "ProceedingType",
ADD COLUMN     "rentalType" "RentalType";

-- AlterTable
ALTER TABLE "LegalDeadlineSnapshot" ADD COLUMN     "complaintDays" INTEGER,
ADD COLUMN     "nextActionEligibleDate" TIMESTAMP(3),
ADD COLUMN     "nextActionType" "NextActionType",
ADD COLUMN     "nextActionWaitingDays" INTEGER,
ADD COLUMN     "objectionDays" INTEGER,
ADD COLUMN     "paymentDays" INTEGER,
ADD COLUMN     "performanceDays" INTEGER,
ADD COLUMN     "resolvedProceedingType" "ProceedingType",
ADD COLUMN     "resolvedSubTypeCode" TEXT,
ADD COLUMN     "vacateDays" INTEGER;
