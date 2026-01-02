-- Fuat Atahan müvekkilinin TC kimlik numarasını güncelle
-- NOT: TC kimlik numarasını kullanıcıdan almalısınız

-- Önce mevcut durumu kontrol et
SELECT id, "displayName", "firstName", "lastName", tckn, vkn, type, address
FROM "Client" 
WHERE "displayName" ILIKE '%fuat%' OR "firstName" ILIKE '%fuat%' OR "lastName" ILIKE '%atahan%';

-- TC kimlik numarasını güncelle (TCKN'yi değiştirin)
-- UPDATE "Client" 
-- SET tckn = 'BURAYA_TCKN_YAZIN'
-- WHERE "displayName" ILIKE '%fuat%atahan%' OR ("firstName" ILIKE '%fuat%' AND "lastName" ILIKE '%atahan%');
