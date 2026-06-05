-- ===============================
-- Phase 2 Sprint 2D — Faz 1: Timeline Tenant Isolation (nullable column + index)
-- Legal Kernel — bkz .kiro/specs/legal-kernel/15-timeline-tenant-isolation-migration.md
-- ===============================
--
-- KIRMIZI ÇİZGİ: Bu migration SADECE schema/storage. Davranış değişikliği YOK.
--   - tenantId NULLABLE eklenir (Faz 4'te NOT NULL olacak)
--   - Backfill YOK         (Faz 3)
--   - Writer değişikliği YOK (Faz 2)
--   - DB trigger YOK        (Sprint 3 — defense-in-depth)
--
-- Mevcut yazımlar kırılmaz: kolon nullable, default'suz.

-- 1) Nullable tenantId kolonu
ALTER TABLE "IcrabotTimelineEntry"
  ADD COLUMN "tenantId" TEXT;

-- 2) Tenant-scoped sorgu/partition için index
CREATE INDEX "IcrabotTimelineEntry_tenantId_caseId_idx"
  ON "IcrabotTimelineEntry"("tenantId", "caseId");
