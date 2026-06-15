-- Operasyonel görev katmanı (PR-1): Task'a kategori / müvekkil-bağlama / dedupe / eksik-alan /
-- eskalasyon alanları + Client'a müvekkil-seviyesi iletişim takibi durumu.
-- ADDITIVE: tüm kolonlar nullable veya default'lu → mevcut satırlar ETKİLENMEZ. Mevcut Task'lar
-- taskCategory=LEGAL_WORKFLOW (default) alır = bugünkü "İcra" görünümü korunur. Yeni tablo YOK.
-- DATA_QUALITY kasıtlı olarak enum'da yok (computed badge/signal olacak, görev değil).
-- NOT: DB apply (migrate deploy) ayrı adım; prod N/A.

-- Enums
CREATE TYPE "TaskCategory" AS ENUM ('LEGAL_WORKFLOW', 'OPERATIONAL_COMPLETENESS');
CREATE TYPE "EscalationTier" AS ENUM ('STAFF', 'MANAGER', 'FOUNDER');
CREATE TYPE "ClientContactFollowUpStatus" AS ENUM ('ACTIVE', 'WAIVED', 'COMPLETED');

-- Task kolonları
ALTER TABLE "Task" ADD COLUMN "clientId" TEXT;
ALTER TABLE "Task" ADD COLUMN "taskCategory" "TaskCategory" NOT NULL DEFAULT 'LEGAL_WORKFLOW';
ALTER TABLE "Task" ADD COLUMN "dedupeKey" TEXT;
ALTER TABLE "Task" ADD COLUMN "missingFields" JSONB;
ALTER TABLE "Task" ADD COLUMN "escalationLevel" "EscalationTier";
ALTER TABLE "Task" ADD COLUMN "nextFollowUpAt" TIMESTAMP(3);

-- Client kolonu
ALTER TABLE "Client" ADD COLUMN "contactFollowUpStatus" "ClientContactFollowUpStatus";

-- Unique (dedupe) + indexler. dedupeKey nullable → Postgres çoklu-NULL'a izin verir, mevcut satırlar çakışmaz.
CREATE UNIQUE INDEX "Task_dedupeKey_key" ON "Task"("dedupeKey");
CREATE INDEX "Task_tenantId_taskCategory_status_idx" ON "Task"("tenantId", "taskCategory", "status");
CREATE INDEX "Task_clientId_idx" ON "Task"("clientId");
CREATE INDEX "Task_nextFollowUpAt_idx" ON "Task"("nextFollowUpAt");

-- FK: Task.clientId → Client.id
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
