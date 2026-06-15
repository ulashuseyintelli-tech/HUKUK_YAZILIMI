-- PR-PERF-1: Görev kapanış atfı. Performans ölçümü sistem kapanışını insan kapanışından
-- ayırt edebilsin diye (ör. "Fatma 500 görev kapattı"nın 450'si AUTO_SYSTEM olabilir).
-- ADDITIVE: iki kolon da nullable, enum yeni → mevcut satırlar ETKİLENMEZ (geçmiş kapanışlar
-- completedByUserId=NULL, resolutionType=NULL kalır = "bilinmiyor"; ileriye dönük dürüst veri).
-- NOT: DB apply (migrate deploy) ayrı adım; prod N/A.

-- Enum
CREATE TYPE "TaskResolutionType" AS ENUM ('MANUAL', 'AUTO_SYSTEM');

-- Task kolonları
ALTER TABLE "Task" ADD COLUMN "completedByUserId" TEXT;
ALTER TABLE "Task" ADD COLUMN "resolutionType" "TaskResolutionType";

-- FK: Task.completedByUserId → User.id (opsiyonel ilişki → User silinirse SET NULL).
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
