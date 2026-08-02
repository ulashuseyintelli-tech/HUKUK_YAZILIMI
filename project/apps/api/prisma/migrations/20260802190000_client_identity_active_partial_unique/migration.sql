-- C1-B05 (FIND-C3, CLAUDE-CLIENT-C1) — aktif Client satirlari icin kanonik kimlik tekilligi.
--
-- DESIGN GATE kaniti (ozet — tam gerekce C1 sayfasi §11/B05 ve PR govdesinde):
--  * PG16 NULLS DISTINCT: NULL kimlik index'e girmez, serbest kalir.
--  * Bos string ('') bir DEGERDIR ve tam unique'te carpisirdi -> WHERE kosulu disinda tutar
--    (null/empty normalization kaniti).
--  * Soft-delete modeli (isActive=false) legacy duplicate tasiyabilir -> index yalniz AKTIF
--    satirlari baglar; reactivate-via-create yarisi da DB seviyesinde kapanir (aktifken
--    ayni kimlikli ikinci satir/aktivasyon 23505 -> servis DUPLICATE_IDENTITY'ye cevirir).
--  * identityNo @deprecated MIXED kolondur (tckn VEYA vkn kopyasi): kanonik alan degildir,
--    index'e ALINMAZ — servis-seviyesi dedup probe'u (C1-B04) onu kapsamaya devam eder.
--  * Client ~15 iliskinin FK hedefidir: bu migration SATIR SILMEZ, BIRLESTIRMEZ, UPDATE
--    ETMEZ — veri kaybi olasiligi SIFIR. Mevcut aktif duplicate varsa CREATE UNIQUE INDEX
--    HATA verir ve migration fail-closed durur; cozum WAVE 4 kapisina (owner'li pre-clean)
--    aittir, bu dosyaya politika GOMULMEZ.
--  * FIND-C4 (version/CAS): atomik birlikte deploy KANITLANAMADI (payload 'version' alani
--    C2-owned client-mutation-policy allowlist degisikligi ister + XL-3 imza kisiti) ->
--    ayni migration owner altinda SERI paketlenecek ayri is; bu migration'a ALINMADI.
--
-- WAVE 4 duplicate inventory sorgulari (apply ONCESI kosulur; ikisi de 0 satir donmeli):
--   SELECT "tenantId", "tckn", COUNT(*) FROM "Client"
--     WHERE "isActive" = true AND "tckn" IS NOT NULL AND "tckn" <> ''
--     GROUP BY 1, 2 HAVING COUNT(*) > 1;
--   SELECT "tenantId", "vkn", COUNT(*) FROM "Client"
--     WHERE "isActive" = true AND "vkn" IS NOT NULL AND "vkn" <> ''
--     GROUP BY 1, 2 HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX "Client_tenantId_tckn_active_unique"
  ON "Client" ("tenantId", "tckn")
  WHERE "isActive" = true AND "tckn" IS NOT NULL AND "tckn" <> '';

CREATE UNIQUE INDEX "Client_tenantId_vkn_active_unique"
  ON "Client" ("tenantId", "vkn")
  WHERE "isActive" = true AND "vkn" IS NOT NULL AND "vkn" <> '';
