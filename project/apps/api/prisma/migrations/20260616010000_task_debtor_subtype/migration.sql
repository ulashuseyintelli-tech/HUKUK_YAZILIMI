-- PR-D4b: Task'a borçlu bağlama (debtorId) + alt-tür (taskSubType). SALT ALTYAPI.
-- Borçlu completeness/intelligence görevleri clientId-simetrik debtorId ile bağlanır; tek
-- eskalasyon motoru subtype'a göre farklı içerik/deep-link üretir. ADDITIVE: kolonlar nullable,
-- enum yeni → mevcut satırlar etkilenmez. onDelete CASCADE: borçlu silinince görev de silinir.
-- NOT: DB apply (migrate deploy) ayrı; prod N/A.

-- Enum
CREATE TYPE "TaskSubType" AS ENUM ('CLIENT_CONTACT', 'DEBTOR_INFO', 'DEBTOR_INTELLIGENCE');

-- Kolonlar
ALTER TABLE "Task" ADD COLUMN "debtorId" TEXT;
ALTER TABLE "Task" ADD COLUMN "taskSubType" "TaskSubType";

-- İndeks
CREATE INDEX "Task_debtorId_idx" ON "Task"("debtorId");

-- FK: Task.debtorId → Debtor.id (borçlu silinince görev CASCADE silinir)
ALTER TABLE "Task" ADD CONSTRAINT "Task_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
