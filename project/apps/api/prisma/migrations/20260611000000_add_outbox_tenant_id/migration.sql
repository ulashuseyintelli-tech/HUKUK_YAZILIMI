-- outbox-tenancy Phase 1 (doc 26 → outbox-tenancy strand)
-- Additive, nullable tenant capture on the action queue. Forward-only:
--   - üreticiler enqueue anında tenantId yazar (canonical/engine-runner/seed),
--   - tüketiciler (action-handler) satırdan thread eder,
--   - external callback path'i caseId→tenant boundary lookup yapar.
-- NOT NULL'a geçiş + bridge removal AYRI faz (Phase 2). Backfill bu fazda zorunlu değil
-- (queue satırları kısa ömürlü, drain olur; IcrabotOutboxAction immutable DEĞİL → ileride backfill mümkün).

-- AlterTable
ALTER TABLE "IcrabotOutboxAction" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "IcrabotOutboxAction_tenantId_caseId_idx" ON "IcrabotOutboxAction"("tenantId", "caseId");
