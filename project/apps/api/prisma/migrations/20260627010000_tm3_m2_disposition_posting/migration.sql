-- TM3 M2 — disposition posting (postedAt/postedById) + ClientStatement proceeds atfı (caseClientId)
--          + ClientStatementLineType proceeds değerleri.
-- NOT: Bu migration PR'da kalır; shared/dev DB'ye apply için ayrı "uygula" talimatı beklenir.
-- (ALTER TYPE ADD VALUE: yalnız EKLER, aynı migration'da KULLANILMAZ → PG 12+ güvenli.)

-- AlterTable: posting damgaları (kullanıcı onayı)
ALTER TABLE "CollectionDisposition" ADD COLUMN "postedAt" TIMESTAMP(3);
ALTER TABLE "CollectionDisposition" ADD COLUMN "postedById" TEXT;

-- AlterTable: proceeds satırının alacaklı atfı (client-level okuma + çoklu-alacaklı scope)
ALTER TABLE "ClientStatementLine" ADD COLUMN "caseClientId" TEXT;
CREATE INDEX "ClientStatementLine_caseClientId_idx" ON "ClientStatementLine"("caseClientId");

-- AlterEnum: ClientStatementLineType proceeds değerleri (M2). CLIENT_PAYOUT_SENT M3'te eklenecek.
ALTER TYPE "ClientStatementLineType" ADD VALUE 'CASE_COLLECTION_PAYABLE';
ALTER TYPE "ClientStatementLineType" ADD VALUE 'CONTRACTUAL_FEE_WITHHELD';
ALTER TYPE "ClientStatementLineType" ADD VALUE 'FIRM_EXPENSE_REIMBURSEMENT';
ALTER TYPE "ClientStatementLineType" ADD VALUE 'CLIENT_EXPENSE_REIMBURSEMENT';
ALTER TYPE "ClientStatementLineType" ADD VALUE 'COLLECTION_OFFSET_ADVANCE';
