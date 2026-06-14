-- BANK_INTEGRATION: CollectionSource enum'una banka-entegrasyon (otomatik eşleşen banka hareketi)
-- değeri eklenir. G3d'de bank.service delegasyonu sourceType=undefined kullanıyordu (enum'da değer
-- yoktu); bu migration o şema-gate'i kapatır → bank.service artık sourceType=BANK_INTEGRATION yazar.
-- Additive: CollectionSource Collection.sourceType kolonunda kullanılıyor AMA ADD VALUE mevcut satırları
-- ETKİLEMEZ (kolon rewrite yok, veri kaybı yok). PG'de ADD VALUE geri alınamaz (tek-yön).
-- NOT: DB apply (migrate dev/deploy) AYRI/sonra; bu dosya repo'ya hazır girer.

ALTER TYPE "CollectionSource" ADD VALUE 'BANK_INTEGRATION';
