-- E-G1 / E5: InterestTypeCode enum parity.
-- TS InterestTypeCode (packages/types + interest-engine/domain.types) zaten COMMERCIAL_FIXED
-- içeriyordu; Prisma enum'unda YOKTU ("engine'de var / persistence'da yok" garabeti). Bu migration
-- iki tarafı eşitler. Tamamen additive: bu enum tipini KULLANAN HİÇBİR KOLON yok
-- (RateSchedule.interestType = String) → veri taşıma / kolon rewrite / backfill YOK, sıfır-risk.
-- NOT: Postgres'te ADD VALUE geri alınamaz (enum değeri kolay DROP edilemez) → tek-yön.
-- Sona eklenir (kozmetik AFTER kullanılmadı; enum migration'ı gereksiz kırılganlaştırmamak için).

ALTER TYPE "InterestTypeCode" ADD VALUE 'COMMERCIAL_FIXED';
