-- Fuat Atahan müvekkilini bul
SELECT id, "displayName", "firstName", "lastName", tckn, vkn, type, address
FROM "Client" 
WHERE "displayName" ILIKE '%fuat%' OR "firstName" ILIKE '%fuat%' OR "lastName" ILIKE '%atahan%';

-- Vekaletleri kontrol et
SELECT poa.id, poa."clientId", c."displayName" as client_name, poa.status, poa."dateIssued", poa."notaryName", poa."isActive"
FROM "ClientPowerOfAttorney" poa
JOIN "Client" c ON poa."clientId" = c.id
WHERE c."displayName" ILIKE '%fuat%' OR c."firstName" ILIKE '%fuat%';

-- Vekalet-Avukat ilişkisini kontrol et
SELECT pl."poaId", pl."lawyerId", l.name, l.surname, poa."clientId", c."displayName" as client_name
FROM "PoaLawyer" pl
JOIN "Lawyer" l ON pl."lawyerId" = l.id
JOIN "ClientPowerOfAttorney" poa ON pl."poaId" = poa.id
JOIN "Client" c ON poa."clientId" = c.id
WHERE c."displayName" ILIKE '%fuat%' OR c."firstName" ILIKE '%fuat%';

-- Tüm avukatları listele
SELECT id, name, surname FROM "Lawyer" ORDER BY "sortOrder";
