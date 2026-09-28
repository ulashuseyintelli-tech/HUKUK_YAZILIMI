-- K3-L — çek tazminatı borçlu ayrımı (owner kararı 2026-09-28: tazminattan YALNIZ keşideci ve keşideci LEHİNE aval
-- veren sorumludur).
--
-- NE / NEDEN: Aval veren, lehine aval verdiği kişi gibi sorumludur. CaseDebtor yalnız `role = AVAL` diyor; kimin
-- lehine olduğu bilinmediği için tazminat sorumluluğu sınıflandırılamıyordu. Yeni kolon lehine aval verilen borçlunun
-- Debtor.id'sini tutar (ClaimItem.liableDebtorIds ile aynı kimlik uzayı).
--
-- GERİYE UYUMLU: yalnız NULL'a izin veren kolon + CHECK. Mevcut satırlar NULL kalır (CHECK'i sağlar); veri
-- DÜZELTİLMEZ / DOLDURULMAZ. FK bilinçli olarak YOK — değer kullanıldığı anda aynı dosyanın borçlusu olduğu doğrulanır.
-- Eski kod bu kolonu okumaz ve yazmaz; kolonsuz INSERT/UPDATE CHECK'i ihlal etmez.
--
-- KİLİT: ADD COLUMN (NULL, varsayılansız) katalog işlemidir. CHECK önce NOT VALID eklenir (tablo taraması YOK), sonra
-- VALIDATE ile doğrulanır (SHARE UPDATE EXCLUSIVE — okuma/yazma sürer). Kilit alınamazsa HIZLI DÜŞ.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "CaseDebtor" ADD COLUMN "avalForDebtorId" TEXT;

ALTER TABLE "CaseDebtor"
  ADD CONSTRAINT "case_debtor_aval_for_check"
  CHECK ("avalForDebtorId" IS NULL OR ("role" = 'AVAL' AND "avalForDebtorId" <> "debtorId"))
  NOT VALID;

ALTER TABLE "CaseDebtor" VALIDATE CONSTRAINT "case_debtor_aval_for_check";
