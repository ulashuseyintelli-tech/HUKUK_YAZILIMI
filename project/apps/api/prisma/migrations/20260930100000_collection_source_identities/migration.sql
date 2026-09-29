-- K3-L (owner GO 2026-09-29 §3) — TAHSİLAT KAYNAK KİMLİKLERİ: gönderen ve ileten icra dairesi, borçlu kimliğinden AYRI.
--
-- NE / NEDEN: Collection yalnız "hesabına ödeme yapılan borçlu"yu (caseDebtorId) taşıyordu; parayı gönderen
-- (banka counterpartyName, alacak haczinde üçüncü kişi) ve ileten icra dairesi (ExternalCase.externalOffice) ya
-- kaynak satırında kalıyor ya da serbest metne gömülüyordu. İki NULL'lanabilir metin kolonu eklenir; kaynak
-- bilgisi kaybolmaz ve borçlu kimliğine dönüşmez. Resmi mahsup dökümü için hiçbir kaynak alan taşımadığından
-- ona kolon AÇILMAZ.
--
-- GERİYE UYUMLU / EKLEMELİ: yalnız ADD COLUMN (NULL, varsayılan yok) → PostgreSQL'de katalog işlemi (satır yeniden
-- yazılmaz), kısa ACCESS EXCLUSIVE; kilit alınamazsa HIZLI DÜŞ. Backfill YOK: eski satırlar NULL kalır (banka ve
-- alacak haczi kaynaklarına sourceId üzerinden ulaşılmaya devam edilir).
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "Collection"
  ADD COLUMN "payerName" TEXT,
  ADD COLUMN "forwardingOfficeName" TEXT;
