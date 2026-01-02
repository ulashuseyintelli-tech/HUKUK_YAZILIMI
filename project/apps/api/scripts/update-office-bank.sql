-- Büro banka hesabını güncelle
DO $$
DECLARE
    office_id TEXT;
    tenant_id TEXT;
BEGIN
    -- Tenant ID'yi bul
    SELECT id INTO tenant_id FROM "Tenant" LIMIT 1;
    
    -- Office ID'yi bul
    SELECT id INTO office_id FROM "Office" WHERE "tenantId" = tenant_id LIMIT 1;
    
    -- Mevcut banka hesaplarını sil
    DELETE FROM "OfficeBankAccount" WHERE "officeId" = office_id;
    
    -- Yeni banka hesabı ekle - Vakıfbank Çağlayan
    INSERT INTO "OfficeBankAccount" (
        id, "officeId", "bankName", "branchName", iban, "accountName", "isDefault", "createdAt", "updatedAt"
    ) VALUES (
        'bank_vakifbank_caglayan',
        office_id,
        'Türkiye Vakıflar Bankası',
        'Çağlayan',
        'TR170001500158007300656815',
        'Telli Hukuk Bürosu',
        true,
        NOW(),
        NOW()
    );
    
    RAISE NOTICE 'Büro banka hesabı güncellendi!';
END $$;

-- Sonuçları göster
SELECT ba."bankName", ba."branchName", ba.iban, ba."accountName", ba."isDefault"
FROM "OfficeBankAccount" ba
JOIN "Office" o ON ba."officeId" = o.id;
