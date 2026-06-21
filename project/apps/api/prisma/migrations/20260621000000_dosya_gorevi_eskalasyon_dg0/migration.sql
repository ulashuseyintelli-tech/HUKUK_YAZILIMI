-- Gate D / D-i — D-G0: Dosya görevi (case-linked LEGAL_WORKFLOW) owner-first eskalasyon ŞEMASI.
-- ADDITIVE: yeni enum + Task'a 3 nullable kolon + Office'e 4 default'lu kolon. Mevcut satırlar/motor
-- ETKİLENMEZ; operasyonel EscalationTier/escalationLevel ile PAYLAŞIM YOK (K-D1). Henüz hiçbir kod
-- bu alanları okumaz/yazar (servis D-G3'te gelir). DEV-APPLIED (migrate deploy); prod N/A.
-- NOT: `prisma migrate diff` çıktısındaki `DROP INDEX IcrabotTimelineEntry_caseId_aggregateVersion_desc`
-- KASITLI OLARAK DAHİL EDİLMEDİ — o, şemada ifade edilemeyen raw `desc` index'inden kaynaklı
-- pre-existing drift'tir, D-G0 kapsamı DIŞIDIR.

-- CreateEnum
CREATE TYPE "CaseTaskTier" AS ENUM ('RESPONSIBLE', 'TEAM_LEAD', 'MANAGER', 'FOUNDER');

-- AlterTable
ALTER TABLE "Office" ADD COLUMN     "caseTaskManagerDays" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "caseTaskOwnerDays" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "caseTaskTeamLeadDays" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "escalationTeamLeadLawyerIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "caseEscalationLevel" "CaseTaskTier",
ADD COLUMN     "caseLastNotifiedLevel" "CaseTaskTier",
ADD COLUMN     "caseNextFollowUpAt" TIMESTAMP(3);
