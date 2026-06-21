-- Gate D / D-i — D-G3a: Dosya görevi eskalasyon AUDIT tablosu (CaseTaskEscalationEvent).
-- ADDITIVE: yeni enum + yeni tablo + index + cascade FK (tenant/case/task). Mevcut satır/tablo/motor
-- ETKİLENMEZ; operasyonel EscalationEvent ile PAYLAŞIM YOK (K-D1). Henüz hiçbir kod yazar/okur değil
-- (yazıcı servis D-G3b'de gelir). DEV-APPLIED (migrate deploy); prod N/A.
-- NOT: `prisma migrate diff` çıktısındaki `DROP INDEX IcrabotTimelineEntry_caseId_aggregateVersion_desc`
-- KASITLI hariç tutuldu — şemada ifade edilemeyen raw `desc` index drift'i, D-G3a kapsamı DIŞIDIR.

-- CreateEnum
CREATE TYPE "CaseTaskEscalationEventType" AS ENUM ('TIER_ADVANCED', 'NOTIFICATION_SENT', 'NOTIFICATION_SKIPPED', 'NOTIFICATION_FAILED');

-- CreateTable
CREATE TABLE "CaseTaskEscalationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromLevel" "CaseTaskTier",
    "toLevel" "CaseTaskTier",
    "eventType" "CaseTaskEscalationEventType" NOT NULL,
    "channel" TEXT,
    "deliveryStatus" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaseTaskEscalationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseTaskEscalationEvent_tenantId_taskId_idx" ON "CaseTaskEscalationEvent"("tenantId", "taskId");

-- CreateIndex
CREATE INDEX "CaseTaskEscalationEvent_tenantId_caseId_idx" ON "CaseTaskEscalationEvent"("tenantId", "caseId");

-- CreateIndex
CREATE INDEX "CaseTaskEscalationEvent_taskId_createdAt_idx" ON "CaseTaskEscalationEvent"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseTaskEscalationEvent_caseId_createdAt_idx" ON "CaseTaskEscalationEvent"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseTaskEscalationEvent_tenantId_createdAt_idx" ON "CaseTaskEscalationEvent"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "CaseTaskEscalationEvent" ADD CONSTRAINT "CaseTaskEscalationEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseTaskEscalationEvent" ADD CONSTRAINT "CaseTaskEscalationEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseTaskEscalationEvent" ADD CONSTRAINT "CaseTaskEscalationEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
