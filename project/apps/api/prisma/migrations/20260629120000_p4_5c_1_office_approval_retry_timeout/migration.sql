-- P4-5C-1 — OfficeApprovalRequest yürütme retry/stuck metadata kolonları.
-- ADDITIVE / non-breaking: retryCount NOT NULL DEFAULT 0 → mevcut tüm satırlar 0 ile backfill olur (ayrı script YOK);
-- runningStartedAt / lastRetryAt nullable, default yok ("hiç claim edilmedi / hiç denenmedi" doğru başlangıç).
-- Runtime DORMANT: bu kolonların writer'ları yalnız executor/cron yolundan (OFFICE_APPROVAL_EXECUTOR_ENABLED default-OFF)
-- çalışır; migration uygulanana + flag açılana kadar yan etki yok. Multitenant-nötr (per-row). Geri-alma: trivial DROP COLUMN.
ALTER TABLE "OfficeApprovalRequest" ADD COLUMN     "runningStartedAt" TIMESTAMP(3);
ALTER TABLE "OfficeApprovalRequest" ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OfficeApprovalRequest" ADD COLUMN     "lastRetryAt" TIMESTAMP(3);
