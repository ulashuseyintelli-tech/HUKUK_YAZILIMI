-- C3-B05 (§13/9 K9.4/K9.6, decision-log 2026-08-03) — Client.canCollect şema default'u FALSE.
-- Model C ikinci adım: servis-seviyesi tek fail-closed kapı (client-poa-capability)
-- teslim edildi; bu migration yalnız YENİ satır default'unu düzeltir.
-- K9.5: MEVCUT satır değerlerine DOKUNULMAZ (otomatik grandfathering YOK; envanter +
-- readiness raporu WAVE 4 aktivasyonu öncesinde ayrı yürütülür). Efektif yetki zaten
-- servis kapısında POA'ya bağlı olduğundan mevcut true değerleri tek başına yetki VERMEZ.
-- PRODUCTION APPLY: WAVE 4 / C3-PROD-ACTIVATION (ayrı owner yetkisi) — engineering teslimi.

-- AlterTable
ALTER TABLE "Client" ALTER COLUMN "canCollect" SET DEFAULT false;
