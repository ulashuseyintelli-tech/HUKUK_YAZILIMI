-- OFFICE-A07 — onay yurutme kaniti icin talebe VE denemeye ozgu kesin bag.
--
-- NE: `CaseStatusHistory` uzerine iki NULLABLE skaler kolon + reconcile'in gercek yuklemine
-- uygun tek indeks. Modullerarasi FK KURULMAZ (kanonik desen: CollectionDisposition.approvalRequestId).
--
-- ── KILIT VE SURE SINIRI (bilincli secim, gerekce) ─────────────────────────────────────────
-- Canli PG'de olculen ayarlar: lock_timeout = 0 · statement_timeout = 0 ·
-- idle_in_transaction_session_timeout = 0. Yani varsayilan olarak SINIRSIZ BEKLEME vardir.
-- `ALTER TABLE ... ADD COLUMN` **ACCESS EXCLUSIVE** kilit ister; bu kilit talebi kuyruga
-- girdigi anda arkasindaki TUM yeni sorgular bloke olur — OKUMA DAHIL. Tek bir uzun veya
-- idle-in-transaction islem, 930 satirlik bir tabloda bile canliyi durdurabilir.
-- Bu yuzden kilit alinamazsa migration HIZLI DUSER; canliyi kuyruga SOKMAZ.
-- Deger 3s secildi: deadlock_timeout 1000 ms'in uzerinde (yanlis-pozitif yok) ama kesinti
-- butcesi icinde ihmal edilebilir. Gurultulu basarisizlik, sessiz stall'dan iyidir.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- ── ATOMIKLIK ──────────────────────────────────────────────────────────────────────────────
-- `CREATE INDEX` DUZ kullanilir; es-zamanli (non-blocking) indeks varyanti BILINCLI OLARAK
-- KULLANILMAMISTIR. Gerekce: bu boyutta (indeks ~16-64 kB) faydasi yok ama maliyeti var —
-- o varyant transaction ICINDE kosamaz, dolayisiyla kismi/INVALID indeks birakabilir ve
-- basarisizlik davranisini "atomik" olmaktan cikarir. Duz CREATE INDEX ile ADD COLUMN
-- AYNI DDL transaction'inda kalir:
--   basarisizlik = TAM GERI ALMA, kismi durum YOK.
ALTER TABLE "CaseStatusHistory" ADD COLUMN "approvalRequestId" TEXT;
ALTER TABLE "CaseStatusHistory" ADD COLUMN "approvalAttempt" INTEGER;

-- Reconcile'in gercek yuklemi: (approvalRequestId, approvalAttempt) esitligi.
CREATE INDEX "CaseStatusHistory_approvalRequestId_approvalAttempt_idx"
  ON "CaseStatusHistory" ("approvalRequestId", "approvalAttempt");
