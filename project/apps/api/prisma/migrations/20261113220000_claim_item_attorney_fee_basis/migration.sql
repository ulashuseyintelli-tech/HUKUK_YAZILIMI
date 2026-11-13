-- Vekâlet ücretinin hukuki kaynağı (owner K1, 13.11.2026 GO-COMPLETE "İlam kalemleri için yapısal ayrım ve faiz hesabını uygula").
-- Yalnız EKLEMELİ: yeni tür + NULL kabul eden sütun + tutarlılık kısıtı. Varsayılan YOK, geri doldurma YOK:
-- mevcut satırların tamamı NULL (= bilinmiyor) kalır; açıklamadan çıkarım ya da toplu dönüştürme yapılmaz.

-- CreateEnum
CREATE TYPE "AttorneyFeeBasis" AS ENUM ('JUDGMENT_AWARDED', 'ENFORCEMENT_TARIFF');

-- AlterTable
ALTER TABLE "ClaimItem" ADD COLUMN "attorneyFeeBasis" "AttorneyFeeBasis";

-- Alan yalnız vekâlet ücreti kaleminde dolu olabilir (mevcut satırlar NULL olduğundan kısıt hepsini sağlar).
ALTER TABLE "ClaimItem" ADD CONSTRAINT "ClaimItem_attorneyFeeBasis_itemType_check"
  CHECK ("attorneyFeeBasis" IS NULL OR "itemType" = 'ATTORNEY_FEE');
