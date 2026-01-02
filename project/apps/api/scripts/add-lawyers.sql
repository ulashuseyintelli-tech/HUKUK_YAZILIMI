-- Tenant ID'yi bul
DO $$
DECLARE
    tenant_id TEXT;
BEGIN
    SELECT id INTO tenant_id FROM "Tenant" LIMIT 1;
    
    -- Av. Fatma Uluca Telli ekle
    INSERT INTO "Lawyer" (
        id, "tenantId", name, surname, tckn, 
        address, city, district, phone, fax,
        "bankName", "branchName", iban, "barCity",
        role, "canSign", "canAppearInUyap", "isDefaultForNewCases", "isActive",
        "createdAt", "updatedAt"
    ) VALUES (
        'lawyer_fatma_uluca_telli', tenant_id, 'Fatma', 'Uluca Telli', '45706890548',
        'Mecidiyeköy Yolu Cd. Karsuyu Sokak No:2 Trump Towers Kule 1 Kat:4 D:401 Şişli/İstanbul',
        'İstanbul', 'Şişli', '0212 230 89 10', '0212 247 52 04',
        'Türkiye Vakıflar Bankası', 'Çağlayan', 'TR170001500158007300656815', 'İstanbul',
        'PARTNER', true, true, false, true,
        NOW(), NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        address = EXCLUDED.address,
        phone = EXCLUDED.phone,
        fax = EXCLUDED.fax,
        "bankName" = EXCLUDED."bankName",
        "branchName" = EXCLUDED."branchName",
        iban = EXCLUDED.iban,
        "updatedAt" = NOW();
    
    -- Av. Ulaş Hüseyin Telli ekle
    INSERT INTO "Lawyer" (
        id, "tenantId", name, surname, tckn,
        address, city, district, phone, fax,
        "bankName", "branchName", iban, "barCity",
        role, "canSign", "canAppearInUyap", "isDefaultForNewCases", "isActive",
        "createdAt", "updatedAt"
    ) VALUES (
        'lawyer_ulas_huseyin_telli', tenant_id, 'Ulaş Hüseyin', 'Telli', '37405957684',
        'Mecidiyeköy Yolu Cd. Karsuyu Sokak No:2 Trump Towers Kule 1 Kat:4 D:401 Şişli/İstanbul',
        'İstanbul', 'Şişli', '0212 230 89 10', '0212 247 52 04',
        'Türkiye Vakıflar Bankası', 'Çağlayan', 'TR170001500158007300656815', 'İstanbul',
        'PARTNER', true, true, true, true,
        NOW(), NOW()
    ) ON CONFLICT (id) DO UPDATE SET
        address = EXCLUDED.address,
        phone = EXCLUDED.phone,
        fax = EXCLUDED.fax,
        "bankName" = EXCLUDED."bankName",
        "branchName" = EXCLUDED."branchName",
        iban = EXCLUDED.iban,
        "updatedAt" = NOW();
        
    -- Mevcut tüm avukatları güncelle
    UPDATE "Lawyer" SET
        address = 'Mecidiyeköy Yolu Cd. Karsuyu Sokak No:2 Trump Towers Kule 1 Kat:4 D:401 Şişli/İstanbul',
        city = 'İstanbul',
        district = 'Şişli',
        phone = '0212 230 89 10',
        fax = '0212 247 52 04',
        "bankName" = 'Türkiye Vakıflar Bankası',
        "branchName" = 'Çağlayan',
        iban = 'TR170001500158007300656815',
        "barCity" = 'İstanbul',
        "updatedAt" = NOW()
    WHERE "tenantId" = tenant_id;
    
    RAISE NOTICE 'Avukatlar güncellendi ve eklendi!';
END $$;

-- Sonuçları göster
SELECT name, surname, phone, fax, "bankName", "branchName", iban FROM "Lawyer";
