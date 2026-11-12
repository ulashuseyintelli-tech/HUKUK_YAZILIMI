-- Yargılama Gideri türü (owner 12.11.2026 GO-COMPLETE "P02 yargılama gideri temsil engelini gider").
-- Yalnız EKLEMELİ enum değeri: mevcut satır / tür / varsayılan DEĞİŞMEZ; mevcut EXPENSE kayıtları dönüştürülmez.
ALTER TYPE "DueType" ADD VALUE 'YARGILAMA_GIDERI';
ALTER TYPE "ClaimItemType" ADD VALUE 'YARGILAMA_GIDERI';
