-- Seçimlik kalem bazlı borçlu sorumluluğu.
-- Karar: decision-log 2026-11-15, DEBTOR-OD07-CLAIM-LIABILITY-SELECTION-SA01 (OD-07 dar kapsamlı yeniden açış).
--
-- YALNIZ EKLEMELİ (EXPAND): iki yeni tablo, dört yeni enum, bir boş bırakılabilir sütun.
-- Mevcut tabloların mevcut sütunları ve satırları DEĞİŞMEZ; geri doldurma / toplu dönüşüm YOKTUR.
-- Mevcut enum'lara değer EKLENMEZ: gerçek eski sürüm sınaması, önceki derlemenin tanımadığı enum değerini taşıyan
-- satırı okuyamadığını gösterdi (geri dönüş güvenliği).
-- Aşağı migration yoktur (ileri yönlü).

-- CreateEnum
CREATE TYPE "ClaimLiabilityMode" AS ENUM ('JOINT_AND_SEVERAL', 'PROPORTIONAL', 'CAPPED', 'UNDETERMINED');

-- CreateEnum
CREATE TYPE "ClaimLiabilityBasis" AS ENUM ('COURT_JUDGMENT', 'CONTRACT', 'STATUTE', 'NEGOTIABLE_INSTRUMENT', 'LAWYER_ASSESSMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ClaimLiabilitySetStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ClaimLiabilityLimitScope" AS ENUM ('ITEM_AMOUNT');

-- AlterTable (boş bırakılabilir; eski satırlar NULL kalır)
ALTER TABLE "CollectionOverpayment" ADD COLUMN     "caseDebtorId" TEXT;

-- CreateTable
CREATE TABLE "ClaimItemLiabilitySet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "claimItemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "mode" "ClaimLiabilityMode" NOT NULL,
    "limitScope" "ClaimLiabilityLimitScope",
    "status" "ClaimLiabilitySetStatus" NOT NULL DEFAULT 'ACTIVE',
    "basis" "ClaimLiabilityBasis",
    "basisNote" TEXT,
    "basisDocumentId" TEXT,
    "decidedByUserId" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "approvalRequestId" TEXT,
    "appliedVia" TEXT NOT NULL,
    "bulkOperationId" TEXT,
    "supersededAt" TIMESTAMP(3),
    "supersededBySetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimItemLiabilitySet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimItemLiabilityParty" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "mode" "ClaimLiabilityMode" NOT NULL,
    "caseDebtorId" TEXT NOT NULL,
    "shareWeight" INTEGER,
    "limitAmount" DECIMAL(15,2),
    "unlimited" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimItemLiabilityParty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClaimItemLiabilitySet_tenantId_caseId_status_idx" ON "ClaimItemLiabilitySet"("tenantId", "caseId", "status");

-- CreateIndex
CREATE INDEX "ClaimItemLiabilitySet_claimItemId_status_idx" ON "ClaimItemLiabilitySet"("claimItemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimItemLiabilitySet_claimItemId_version_key" ON "ClaimItemLiabilitySet"("claimItemId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimItemLiabilitySet_id_mode_key" ON "ClaimItemLiabilitySet"("id", "mode");

-- CreateIndex
CREATE INDEX "ClaimItemLiabilityParty_caseDebtorId_idx" ON "ClaimItemLiabilityParty"("caseDebtorId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimItemLiabilityParty_setId_caseDebtorId_key" ON "ClaimItemLiabilityParty"("setId", "caseDebtorId");

-- CreateIndex
CREATE INDEX "CollectionOverpayment_caseDebtorId_idx" ON "CollectionOverpayment"("caseDebtorId");

-- AddForeignKey
ALTER TABLE "CollectionOverpayment" ADD CONSTRAINT "CollectionOverpayment_caseDebtorId_fkey" FOREIGN KEY ("caseDebtorId") REFERENCES "CaseDebtor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimItemLiabilitySet" ADD CONSTRAINT "ClaimItemLiabilitySet_tenantId_caseId_claimItemId_fkey" FOREIGN KEY ("tenantId", "caseId", "claimItemId") REFERENCES "ClaimItem"("tenantId", "caseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimItemLiabilityParty" ADD CONSTRAINT "ClaimItemLiabilityParty_setId_mode_fkey" FOREIGN KEY ("setId", "mode") REFERENCES "ClaimItemLiabilitySet"("id", "mode") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimItemLiabilityParty" ADD CONSTRAINT "ClaimItemLiabilityParty_caseDebtorId_fkey" FOREIGN KEY ("caseDebtorId") REFERENCES "CaseDebtor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Prisma'nın deklaratif ifade edemediği kısıtlar (raw SQL).
-- ─────────────────────────────────────────────────────────────────────────────────────────────

-- Kalem başına en çok BİR etkin seçim.
CREATE UNIQUE INDEX "ClaimItemLiabilitySet_one_active_per_item" ON "ClaimItemLiabilitySet"("claimItemId") WHERE "status" = 'ACTIVE';

-- Seçim sürümü satır kuralları.
ALTER TABLE "ClaimItemLiabilitySet"
  ADD CONSTRAINT "claim_item_liability_set_version_check" CHECK ("version" >= 1),
  -- Tavan kapsamı yalnız ve her zaman tutarla sınırlı türde.
  ADD CONSTRAINT "claim_item_liability_set_limit_scope_check" CHECK (("mode" = 'CAPPED') = ("limitScope" IS NOT NULL)),
  -- "Belirlenmedi" dışında dayanak zorunlu; açıklama isteyen dayanaklarda not zorunlu.
  ADD CONSTRAINT "claim_item_liability_set_basis_check" CHECK (
    "mode" = 'UNDETERMINED'
    OR (
      "basis" IS NOT NULL
      AND ("basis" NOT IN ('LAWYER_ASSESSMENT', 'OTHER') OR char_length(btrim(coalesce("basisNote", ''))) > 0)
    )
  ),
  ADD CONSTRAINT "claim_item_liability_set_applied_via_check" CHECK (
    ("appliedVia" = 'SINGLE' AND "bulkOperationId" IS NULL)
    OR ("appliedVia" = 'BULK' AND "bulkOperationId" IS NOT NULL)
  ),
  -- Etkin satır kapanış izi taşımaz; kapanmış satır kapanış zamanını taşır.
  ADD CONSTRAINT "claim_item_liability_set_chain_check" CHECK (
    ("status" = 'ACTIVE' AND "supersededAt" IS NULL AND "supersededBySetId" IS NULL)
    OR ("status" = 'SUPERSEDED' AND "supersededAt" IS NOT NULL AND "supersededBySetId" IS NOT NULL)
  );

-- Seçim tarafı satır kuralları (tür, bileşik bağ ile satıra taşınır).
ALTER TABLE "ClaimItemLiabilityParty"
  ADD CONSTRAINT "claim_item_liability_party_mode_fields_check" CHECK (
    ("mode" = 'JOINT_AND_SEVERAL' AND "shareWeight" IS NULL AND "limitAmount" IS NULL AND "unlimited" = false)
    OR ("mode" = 'PROPORTIONAL' AND "shareWeight" BETWEEN 1 AND 1000000 AND "limitAmount" IS NULL AND "unlimited" = false)
    OR (
      "mode" = 'CAPPED' AND "shareWeight" IS NULL
      AND (("unlimited" = true AND "limitAmount" IS NULL) OR ("unlimited" = false AND "limitAmount" > 0))
    )
  ),
  ADD CONSTRAINT "claim_item_liability_party_sort_order_check" CHECK ("sortOrder" >= 0);

-- Borçlu atıflı fazla ödeme yalnız pozitif tutarlı satırda anlamlıdır (mevcut satırlarda sütun NULL → kısıt etkisiz).
ALTER TABLE "CollectionOverpayment"
  ADD CONSTRAINT "collection_overpayment_attributed_amount_check" CHECK ("caseDebtorId" IS NULL OR "amount" > 0);

-- Değişmezlik: seçim sürümü yalnız ACTIVE → SUPERSEDED kapanabilir; başka hiçbir alan değişemez.
CREATE OR REPLACE FUNCTION claim_item_liability_set_guard_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" <> 'ACTIVE' OR NEW."status" <> 'SUPERSEDED' THEN
    RAISE EXCEPTION 'immutable_violation: ClaimItemLiabilitySet only closes ACTIVE -> SUPERSEDED.'
      USING ERRCODE = '45010';
  END IF;
  IF ROW(
       NEW."id", NEW."tenantId", NEW."caseId", NEW."claimItemId", NEW."version", NEW."mode", NEW."limitScope",
       NEW."basis", NEW."basisNote", NEW."basisDocumentId", NEW."decidedByUserId", NEW."decidedAt",
       NEW."approvalRequestId", NEW."appliedVia", NEW."bulkOperationId", NEW."createdAt"
     ) IS DISTINCT FROM ROW(
       OLD."id", OLD."tenantId", OLD."caseId", OLD."claimItemId", OLD."version", OLD."mode", OLD."limitScope",
       OLD."basis", OLD."basisNote", OLD."basisDocumentId", OLD."decidedByUserId", OLD."decidedAt",
       OLD."approvalRequestId", OLD."appliedVia", OLD."bulkOperationId", OLD."createdAt"
     ) THEN
    RAISE EXCEPTION 'immutable_violation: ClaimItemLiabilitySet decision fields are immutable.'
      USING ERRCODE = '45010';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "guard_claim_item_liability_set_update"
  BEFORE UPDATE ON "ClaimItemLiabilitySet"
  FOR EACH ROW EXECUTE FUNCTION claim_item_liability_set_guard_update();

-- Seçim tarafı satırı hiç değiştirilemez (yeni sürüm yeni satırlarla yazılır).
CREATE TRIGGER "prevent_claim_item_liability_party_update"
  BEFORE UPDATE ON "ClaimItemLiabilityParty"
  FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();
