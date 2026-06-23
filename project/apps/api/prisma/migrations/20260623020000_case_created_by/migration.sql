-- WP-1b: Case.createdById — dosyayı OLUŞTURAN kullanıcı (creator attribution).
-- ADDITIVE: nullable kolon; yeni create'lerde set edilir, mevcut satırlar NULL = "bilinmiyor"
-- (backfill YOK; audit/legacy'den tahmin ÜRETİLMEZ → null-toleranslı). Temporal sorumluluk
-- sorgusu (WP-1d) için creation-anı sinyali. NOT: DB apply (migrate deploy) ayrı adım; prod N/A.

-- Case kolonu
ALTER TABLE "Case" ADD COLUMN "createdById" TEXT;

-- FK: Case.createdById → User.id (opsiyonel ilişki → User silinirse SET NULL; create'i bozmaz).
ALTER TABLE "Case" ADD CONSTRAINT "Case_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index (schema @@index([createdById]) ile uyumlu).
CREATE INDEX "Case_createdById_idx" ON "Case"("createdById");
