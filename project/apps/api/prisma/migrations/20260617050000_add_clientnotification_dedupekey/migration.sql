-- Faz 3 alt-faz 3.3: ClientNotification.dedupeKey + index (idempotency — additive)
-- NOT: migrate diff'teki alakasız "DROP INDEX IcrabotTimelineEntry_caseId_aggregateVersion_desc"
-- satırı KASTEN dahil edilmedi (mevcut drift; Faz 2 ile aynı).

ALTER TABLE "ClientNotification" ADD COLUMN "dedupeKey" TEXT;

CREATE INDEX "ClientNotification_dedupeKey_idx" ON "ClientNotification"("dedupeKey");
