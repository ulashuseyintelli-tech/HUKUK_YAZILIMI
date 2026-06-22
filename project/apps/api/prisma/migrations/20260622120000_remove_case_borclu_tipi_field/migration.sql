-- CASE-BORCLU-TIPI-CLEANUP PR-B
-- Dosya-seviyesi "Borçlu Tipi" alanı kaldırılıyor (phantom alan: yazılmıyordu, okunmuyordu).
-- Otorite = Debtor.type. Üretim verisi yok: Case.borcluTipiId tüm satırlarda NULL (count=0 doğrulandı).

-- DropForeignKey
ALTER TABLE "Case" DROP CONSTRAINT "Case_borcluTipiId_fkey";

-- AlterTable
ALTER TABLE "Case" DROP COLUMN "borcluTipiId";

-- AlterTable
ALTER TABLE "LookupTakipTuru" DROP COLUMN "defaultBorcluTipiId";

-- DropTable
DROP TABLE "LookupBorcluTipi";
