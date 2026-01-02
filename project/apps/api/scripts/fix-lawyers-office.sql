-- Office ID'yi bul ve avukatları ilişkilendir
DO $$
DECLARE
    office_id TEXT;
    tenant_id TEXT;
BEGIN
    -- Tenant ID'yi bul
    SELECT id INTO tenant_id FROM "Tenant" LIMIT 1;
    RAISE NOTICE 'Tenant ID: %', tenant_id;
    
    -- Office ID'yi bul
    SELECT id INTO office_id FROM "Office" WHERE "tenantId" = tenant_id LIMIT 1;
    RAISE NOTICE 'Office ID: %', office_id;
    
    -- Eğer office yoksa oluştur
    IF office_id IS NULL THEN
        INSERT INTO "Office" (id, "tenantId", name, "createdAt", "updatedAt")
        VALUES ('office_default', tenant_id, 'Telli Hukuk', NOW(), NOW())
        RETURNING id INTO office_id;
        RAISE NOTICE 'Office oluşturuldu: %', office_id;
    END IF;
    
    -- Tüm avukatları bu office'e bağla
    UPDATE "Lawyer" 
    SET "officeId" = office_id, "updatedAt" = NOW()
    WHERE "tenantId" = tenant_id;
    
    RAISE NOTICE 'Avukatlar office ile ilişkilendirildi!';
END $$;

-- Sonuçları göster
SELECT l.id, l.name, l.surname, l."officeId", o.name as office_name
FROM "Lawyer" l
LEFT JOIN "Office" o ON l."officeId" = o.id
ORDER BY l.name;
