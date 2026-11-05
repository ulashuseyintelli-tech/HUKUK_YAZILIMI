-- CreateTable
CREATE TABLE "TaskCancellationEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorRole" "UserRole" NOT NULL,
    "authoritySource" TEXT NOT NULL,
    "fromStatus" "TaskStatus" NOT NULL,
    "toStatus" "TaskStatus" NOT NULL DEFAULT 'CANCELLED',
    "previousCompletedAt" TIMESTAMP(3),
    "previousCompletedByUserId" TEXT,
    "previousResolutionType" "TaskResolutionType",
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCancellationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskCancellationEvent_tenantId_taskId_createdAt_id_idx" ON "TaskCancellationEvent"("tenantId", "taskId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Task_id_tenantId_key" ON "Task"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "TaskCancellationEvent" ADD CONSTRAINT "TaskCancellationEvent_taskId_tenantId_fkey" FOREIGN KEY ("taskId", "tenantId") REFERENCES "Task"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Domain invariants; no existing row rewrite or historical attribution backfill.
ALTER TABLE "TaskCancellationEvent" ADD CONSTRAINT "TaskCancellationEvent_state_check" CHECK ("toStatus" = 'CANCELLED' AND "fromStatus" <> 'CANCELLED');
ALTER TABLE "TaskCancellationEvent" ADD CONSTRAINT "TaskCancellationEvent_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 1 AND 2000);
ALTER TABLE "TaskCancellationEvent" ADD CONSTRAINT "TaskCancellationEvent_actor_check" CHECK (char_length(btrim("actorUserId")) > 0 AND (("actorRole" = 'ADMIN' AND "authoritySource" = 'ADMIN') OR ("actorRole" = 'USER' AND "authoritySource" = 'CREATOR')));
