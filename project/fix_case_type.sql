-- 2026/11 takibinin type'ını BOND olarak güncelle (Senet takibi)
UPDATE "Case" 
SET type = 'BOND' 
WHERE "fileNumber" = '2026/11';

-- Kontrol
SELECT id, "fileNumber", type FROM "Case" WHERE "fileNumber" LIKE '2026/%' ORDER BY "fileNumber";
