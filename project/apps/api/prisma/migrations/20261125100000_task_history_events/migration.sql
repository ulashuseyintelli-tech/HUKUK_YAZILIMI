-- F03-A2 (OFP-03a / OFF-INV-08): genel görev geçmişi. YALNIZ EKLEME: yeni tablo + indeks + FK + CHECK.
-- Mevcut satırlara dokunulmaz; geriye dönük geçmiş satırı ÜRETİLMEZ. Geri dönüş sınırı: kod geri alınır, tablo kalır
-- (eski derleme bu tabloyu okumaz / yazmaz).

-- CreateTable
CREATE TABLE "TaskHistoryEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" "UserRole",
    "authoritySource" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "details" JSONB,
    "reason" TEXT,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskHistoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskHistoryEvent_tenantId_taskId_createdAt_id_idx" ON "TaskHistoryEvent"("tenantId", "taskId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "TaskHistoryEvent_tenantId_correlationId_idx" ON "TaskHistoryEvent"("tenantId", "correlationId");

-- AddForeignKey
ALTER TABLE "TaskHistoryEvent" ADD CONSTRAINT "TaskHistoryEvent_taskId_tenantId_fkey" FOREIGN KEY ("taskId", "tenantId") REFERENCES "Task"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Domain invariants (TaskCancellationEvent deseni).
ALTER TABLE "TaskHistoryEvent" ADD CONSTRAINT "TaskHistoryEvent_event_check" CHECK (char_length(btrim("eventType")) > 0 AND char_length(btrim("correlationId")) > 0);
ALTER TABLE "TaskHistoryEvent" ADD CONSTRAINT "TaskHistoryEvent_actor_check" CHECK (
  ("actorType" = 'USER' AND "actorUserId" IS NOT NULL AND char_length(btrim("actorUserId")) > 0 AND "actorRole" IS NOT NULL AND "authoritySource" <> 'SYSTEM_PRODUCER')
  OR ("actorType" = 'SYSTEM' AND "actorUserId" IS NULL AND "actorRole" IS NULL AND "authoritySource" = 'SYSTEM_PRODUCER')
);
ALTER TABLE "TaskHistoryEvent" ADD CONSTRAINT "TaskHistoryEvent_reason_check" CHECK ("reason" IS NULL OR char_length(btrim("reason")) BETWEEN 1 AND 2000);
