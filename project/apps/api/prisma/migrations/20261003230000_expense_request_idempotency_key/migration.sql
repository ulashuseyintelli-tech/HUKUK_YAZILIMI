-- Aşama masraf seti İSTEK ANAHTARI (owner 2026-10-03, madde 4) — çift tıklama / ağ yeniden denemesi / süreç yeniden
-- başladıktan sonra tekrar AYNI talebi döndürür; ikinci talep yazmaz.
--
-- NE / NEDEN: POST /expense-requests/case/:caseId/stage/:stageCode her çağrıda yeni talep + günlük kaydı yazıyordu (3 istek →
-- 3 × aynı tutarlı talep). İstemci aynı kullanıcı işleminin tekrarında AYNI anahtarı gönderir; sunucu (büro, anahtar) için
-- tek satır tutar. requestFingerprint = sha256{caseId, stageCode}: aynı anahtar farklı girdiyle gelirse 409 (uygulama).
--
-- GERİYE UYUMLU / EKLEMELİ: iki NULL'lanabilir kolon (varsayılan yok → PostgreSQL'de katalog işlemi, satır yeniden
-- yazılmaz) + benzersiz indeks. NULL anahtar benzersiz indekste çoğul olabilir: eski satırlar ve anahtarsız çağıranlar
-- bugünkü davranışta kalır. Backfill YOK. create / createFromPackage / açılış seti yazımları kolonlara dokunmaz.
-- İndeks, tamamı NULL olan kolon üzerinde kurulduğu için küçük ve hızlıdır; kilit alınamazsa HIZLI DÜŞ.
--
-- GERİ ALMA AYRI PLANLANIR: uygulamanın eski sürüme dönüşü şemayı geri almayı GEREKTİRMEZ (kolonlar nullable, eski kod
-- görmez). Şemayı geri almak (DROP INDEX + DROP COLUMN) anahtar / fingerprint verisini yok eder ve mükerrer korumasını
-- kaldırır → ayrı owner kararı; otomatik geri dönüş adımı DEĞİLDİR ve anahtar kayıtlarını silen bir adım içermez.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "ExpenseRequest"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestFingerprint" TEXT;

CREATE UNIQUE INDEX "expense_request_tenant_idempotency_key_unique"
  ON "ExpenseRequest" ("tenantId", "idempotencyKey");
