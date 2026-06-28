-- PR-2b: ErrorLog kalıcı dedupe alanları (additive, non-destructive).
-- fingerprint = hata kimliği (analitik/gruplama). activeDedupeKey = AKTİF olay kimliği,
-- yalnız unresolved kayıtta dolu; resolve'da NULL → PostgreSQL nullable-unique (NULLS DISTINCT)
-- sayesinde çözülmüş kayıtlar yan yana durur, aynı hata tekrar patlarsa yeni aktif kayıt açılır.

-- AlterTable
ALTER TABLE "ErrorLog" ADD COLUMN     "activeDedupeKey" TEXT,
ADD COLUMN     "fingerprint" TEXT,
ADD COLUMN     "firstSeenAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "occurrenceCount" INTEGER NOT NULL DEFAULT 1;

-- Backfill: mevcut kayıtlarda firstSeenAt/lastSeenAt = createdAt (occurrenceCount DEFAULT 1 ile gelir).
-- fingerprint ve activeDedupeKey NULL bırakılır → geçmiş kayıtlara RETROAKTİF dedupe YOK
-- (eski hataların yeni olaylarla yanlış birleşmesi engellenir).
UPDATE "ErrorLog" SET "firstSeenAt" = "createdAt", "lastSeenAt" = "createdAt" WHERE "firstSeenAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ErrorLog_activeDedupeKey_key" ON "ErrorLog"("activeDedupeKey");

-- CreateIndex
CREATE INDEX "ErrorLog_tenantId_source_isResolved_lastSeenAt_idx" ON "ErrorLog"("tenantId", "source", "isResolved", "lastSeenAt");

-- CreateIndex
CREATE INDEX "ErrorLog_source_fingerprint_lastSeenAt_idx" ON "ErrorLog"("source", "fingerprint", "lastSeenAt");

-- CreateIndex
CREATE INDEX "ErrorLog_lastSeenAt_idx" ON "ErrorLog"("lastSeenAt");
