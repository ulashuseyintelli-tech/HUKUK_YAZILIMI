-- Ulaş Hüseyin Telli ve Fatma Uluca Telli'yi en üste taşı
UPDATE "Lawyer" SET "sortOrder" = 0 WHERE name = 'Ulaş Hüseyin' AND surname = 'Telli';
UPDATE "Lawyer" SET "sortOrder" = 1 WHERE name = 'Fatma' AND surname = 'Uluca Telli';

-- Diğer avukatları sırala (2'den başlayarak)
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name, surname) + 1 as new_order
  FROM "Lawyer"
  WHERE NOT (name = 'Ulaş Hüseyin' AND surname = 'Telli')
    AND NOT (name = 'Fatma' AND surname = 'Uluca Telli')
)
UPDATE "Lawyer" l
SET "sortOrder" = r.new_order
FROM ranked r
WHERE l.id = r.id;

-- Sonuçları göster
SELECT "sortOrder", name, surname FROM "Lawyer" ORDER BY "sortOrder";
