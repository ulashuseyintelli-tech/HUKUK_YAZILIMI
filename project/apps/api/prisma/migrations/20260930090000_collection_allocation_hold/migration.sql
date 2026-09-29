-- K3-L (owner GO 2026-09-29) — MAHSUBU BEKLETİLEN TAHSİLAT için ayrı model: CollectionAllocationHold.
--
-- NE / NEDEN: #2836 bilgi eksikliği nedeniyle mahsubu bekletilen tahsilatı CollectionOverpayment (fazla ödeme /
-- emanet) satırına metadata.kind=ALLOCATION_HELD ile yazıyordu. Bu yanlış anlamdı: (1) kanonik bakiye zinciri HELD
-- fazla ödemeyi "iade edilebilir / dağıtılabilir emanet" sayar; (2) collectionId @unique olduğundan tamamlamada kalan
-- gerçek fazla ödeme ayrı satır olarak yazılamazdı; (3) RE_ALLOCATED iki anlam taşırdı. Bekletme artık kendi tablosunda:
-- HELD → RELEASED (borçlu girilince mahsup, releasedLedgerEntryId) | REVERSED (tahsilat iptali).
--
-- GERİYE UYUMLU / EKLEMELİ: mevcut tablolar yeniden yazılmaz; yalnız yeni tablo + enum + FK. Mevcut ALLOCATION_HELD
-- satırları (canlıda beklenen 0 — kısıtlı kalem yok; pencere öncesi SAYILIR) yeni tabloya TAŞINIR ve eski satır SİLİNİR
-- (bu satırlar hiçbir defter kaydına bağlı değildir; sourceLedgerEntryId NULL). Ardından CollectionOverpayment'a
-- "bir daha bekletme satırı yazılamaz" CHECK'i NOT VALID + VALIDATE ile eklenir.
--
-- KİLİT: CREATE TABLE/TYPE katalog işlemi; FK'ler referans tablolarda kısa SHARE ROW EXCLUSIVE alır; VALIDATE
-- CONSTRAINT SHARE UPDATE EXCLUSIVE (okuma/yazma sürer). Kilit alınamazsa HIZLI DÜŞ (emsal: 20260929090000).
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- CreateEnum
CREATE TYPE "AllocationHoldStatus" AS ENUM ('HELD', 'RELEASED', 'REVERSED');

-- CreateEnum
CREATE TYPE "AllocationHoldReason" AS ENUM ('ON_BEHALF_DEBTOR_REQUIRED', 'ON_BEHALF_DEBTOR_NOT_LIABLE');

-- CreateTable
CREATE TABLE "CollectionAllocationHold" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "status" "AllocationHoldStatus" NOT NULL DEFAULT 'HELD',
    "holdReason" "AllocationHoldReason" NOT NULL,
    "releasedLedgerEntryId" TEXT,
    "releasedOnBehalfCaseDebtorId" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionAllocationHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CollectionAllocationHold_collectionId_key" ON "CollectionAllocationHold"("collectionId");
CREATE INDEX "CollectionAllocationHold_tenantId_caseId_status_idx" ON "CollectionAllocationHold"("tenantId", "caseId", "status");
CREATE INDEX "CollectionAllocationHold_tenantId_status_idx" ON "CollectionAllocationHold"("tenantId", "status");
CREATE INDEX "CollectionAllocationHold_releasedLedgerEntryId_idx" ON "CollectionAllocationHold"("releasedLedgerEntryId");
CREATE INDEX "CollectionAllocationHold_releasedOnBehalfCaseDebtorId_idx" ON "CollectionAllocationHold"("releasedOnBehalfCaseDebtorId");

-- AddForeignKey
ALTER TABLE "CollectionAllocationHold" ADD CONSTRAINT "CollectionAllocationHold_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionAllocationHold" ADD CONSTRAINT "CollectionAllocationHold_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionAllocationHold" ADD CONSTRAINT "CollectionAllocationHold_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionAllocationHold" ADD CONSTRAINT "CollectionAllocationHold_releasedLedgerEntryId_fkey" FOREIGN KEY ("releasedLedgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CollectionAllocationHold" ADD CONSTRAINT "CollectionAllocationHold_releasedOnBehalfCaseDebtorId_fkey" FOREIGN KEY ("releasedOnBehalfCaseDebtorId") REFERENCES "CaseDebtor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Durum değişmezleri (boş tabloda; taşınan satırlar HELD olduğundan sağlanır)
ALTER TABLE "CollectionAllocationHold"
  ADD CONSTRAINT "collection_allocation_hold_amount_check" CHECK ("amount" > 0),
  ADD CONSTRAINT "collection_allocation_hold_released_check"
    CHECK ("status" <> 'RELEASED' OR ("releasedLedgerEntryId" IS NOT NULL AND "releasedOnBehalfCaseDebtorId" IS NOT NULL AND "releasedAt" IS NOT NULL)),
  ADD CONSTRAINT "collection_allocation_hold_reversed_check"
    CHECK ("status" <> 'REVERSED' OR "reversedAt" IS NOT NULL),
  ADD CONSTRAINT "collection_allocation_hold_held_check"
    CHECK ("status" <> 'HELD' OR ("releasedLedgerEntryId" IS NULL AND "releasedAt" IS NULL AND "reversedAt" IS NULL));

-- Veri taşıma: #2836'nın CollectionOverpayment'a yazdığı bekletme satırları (yalnız satır kilidi; beklenen 0)
INSERT INTO "CollectionAllocationHold" (
  "id", "tenantId", "caseId", "collectionId", "amount", "currency", "status", "holdReason",
  "reversedAt", "metadata", "createdById", "createdAt", "updatedAt"
)
SELECT
  o."id", o."tenantId", o."caseId", o."collectionId", o."amount", o."currency",
  CASE WHEN o."status" = 'REVERSED' THEN 'REVERSED'::"AllocationHoldStatus" ELSE 'HELD'::"AllocationHoldStatus" END,
  CASE WHEN o."metadata"->>'holdReason' = 'ON_BEHALF_DEBTOR_NOT_LIABLE'
       THEN 'ON_BEHALF_DEBTOR_NOT_LIABLE'::"AllocationHoldReason"
       ELSE 'ON_BEHALF_DEBTOR_REQUIRED'::"AllocationHoldReason" END,
  o."reversedAt",
  jsonb_build_object('migratedFromCollectionOverpaymentId', o."id", 'legacyMetadata', o."metadata"),
  o."createdById", o."createdAt", o."updatedAt"
FROM "CollectionOverpayment" o
WHERE o."metadata"->>'kind' = 'ALLOCATION_HELD';

DELETE FROM "CollectionOverpayment" WHERE "metadata"->>'kind' = 'ALLOCATION_HELD';

-- Bekletme bir daha fazla ödeme tablosuna yazılamaz
ALTER TABLE "CollectionOverpayment"
  ADD CONSTRAINT "collection_overpayment_not_allocation_hold_check"
  CHECK ("metadata" IS NULL OR "metadata"->>'kind' IS DISTINCT FROM 'ALLOCATION_HELD')
  NOT VALID;

ALTER TABLE "CollectionOverpayment" VALIDATE CONSTRAINT "collection_overpayment_not_allocation_hold_check";
