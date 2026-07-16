-- CreateEnum
CREATE TYPE "BankTransactionCandidateStatus" AS ENUM ('PENDING', 'SETTLED', 'REJECTED');

-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "candidateStatus" "BankTransactionCandidateStatus";
