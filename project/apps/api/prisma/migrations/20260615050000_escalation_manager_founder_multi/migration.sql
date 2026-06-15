-- Yönetici/Kurucu eskalasyon hedefini TEK → ÇOKLU (dizi) yap. Büyük büroda birden fazla
-- yönetici/kurucu olabilir → hepsine bildirim. VERİ KORUNUR: mevcut tek-id değerleri önce
-- dizilere kopyalanır, sonra eski tek kolonlar düşürülür (seçim kaybolmaz).

-- 1) Yeni dizi kolonları (boş default)
ALTER TABLE "Office" ADD COLUMN "escalationManagerLawyerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Office" ADD COLUMN "escalationFounderLawyerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 2) Mevcut tek-id seçimlerini dizilere taşı (varsa)
UPDATE "Office" SET "escalationManagerLawyerIds" = ARRAY["escalationManagerLawyerId"]
  WHERE "escalationManagerLawyerId" IS NOT NULL;
UPDATE "Office" SET "escalationFounderLawyerIds" = ARRAY["escalationFounderLawyerId"]
  WHERE "escalationFounderLawyerId" IS NOT NULL;

-- 3) Eski tek kolonları düşür (artık dizilerde)
ALTER TABLE "Office" DROP COLUMN "escalationManagerLawyerId";
ALTER TABLE "Office" DROP COLUMN "escalationFounderLawyerId";
