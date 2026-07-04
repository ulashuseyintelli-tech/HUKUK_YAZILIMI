-- Faz-B: Büro yasal / resmi kimlik alanları (additive, nullable; geri-dönük güvenli)
-- vergiNo + vergiDairesi: serbest meslek makbuzu / fatura için zorunlu kimlik
-- mersisNo: büro tüzel kişiyse (şirket / avukatlık ortaklığı)
-- kepAddress: resmi e-yazışma / UYAP KEP adresi
ALTER TABLE "Office" ADD COLUMN "vergiNo" TEXT;
ALTER TABLE "Office" ADD COLUMN "vergiDairesi" TEXT;
ALTER TABLE "Office" ADD COLUMN "mersisNo" TEXT;
ALTER TABLE "Office" ADD COLUMN "kepAddress" TEXT;
