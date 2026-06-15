-- K2: Eskalasyon geçmişi (append-only). Operasyonel eskalasyon motoru (PR-3b) her tier
-- ilerlemesinde ve her bildirim sonucunda buraya iz bırakır. Task üstündeki canlı durum
-- (escalationLevel/lastNotifiedLevel/nextFollowUpAt) DEĞİŞMEZ; bu tablo SLA/rapor/performans
-- için doğrudan sorgulanır. ADDITIVE (yeni tablo+enum, mevcut satırlar etkilenmez).
-- Yazım best-effort (motoru bozmaz). NOT: DB apply (migrate deploy) ayrı; prod N/A.

-- Enum
CREATE TYPE "EscalationEventType" AS ENUM ('TIER_ADVANCED', 'NOTIFICATION_SENT', 'NOTIFICATION_SKIPPED', 'NOTIFICATION_FAILED');

-- Tablo
CREATE TABLE "EscalationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromLevel" "EscalationTier",
    "toLevel" "EscalationTier",
    "eventType" "EscalationEventType" NOT NULL,
    "channel" TEXT,
    "deliveryStatus" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscalationEvent_pkey" PRIMARY KEY ("id")
);

-- İndeksler (SLA/rapor sorguları için)
CREATE INDEX "EscalationEvent_tenantId_taskId_idx" ON "EscalationEvent"("tenantId", "taskId");
CREATE INDEX "EscalationEvent_taskId_createdAt_idx" ON "EscalationEvent"("taskId", "createdAt");
CREATE INDEX "EscalationEvent_tenantId_createdAt_idx" ON "EscalationEvent"("tenantId", "createdAt");

-- FK'lar (görev/tenant silinirse iz de cascade ile gider)
ALTER TABLE "EscalationEvent" ADD CONSTRAINT "EscalationEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EscalationEvent" ADD CONSTRAINT "EscalationEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
