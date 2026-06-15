-- PR-D5-a: mevcut DebtorAddress satırlarında deprecated addressType/isMernis'ten KANONİK type/source
-- türet. Şema DEĞİŞMEZ (yalnız DATA). İDEMPOTENT + körlemesine EZME: yalnız type hâlâ DEFAULT
-- 'DECLARED' olan (= debtor.service deprecated-yol ile yazılmış, kanonik henüz set edilmemiş)
-- satırlara uygula. Manuel/kanonik düzeltilmiş (type ≠ DECLARED) satırlara DOKUNMA.
-- Enum eşleme (N-a): EV→DECLARED, IS→BUSINESS_HQ, TEBLIGAT→DECLARED, MERNIS→MERNIS, KEP→KEP.
-- NOT: DB apply (migrate deploy) ayrı; prod N/A.

-- MERNIS (isMernis=true VEYA addressType='MERNIS') → type=MERNIS, source=MERNIS
UPDATE "DebtorAddress"
SET "type" = 'MERNIS', "source" = 'MERNIS'
WHERE "type" = 'DECLARED' AND ("isMernis" = true OR "addressType" = 'MERNIS');

-- IS → BUSINESS_HQ (idempotent: çalıştıktan sonra type='BUSINESS_HQ' artık DECLARED eşleşmez)
UPDATE "DebtorAddress"
SET "type" = 'BUSINESS_HQ'
WHERE "type" = 'DECLARED' AND "addressType" = 'IS' AND "isMernis" = false;

-- KEP → KEP
UPDATE "DebtorAddress"
SET "type" = 'KEP'
WHERE "type" = 'DECLARED' AND "addressType" = 'KEP' AND "isMernis" = false;

-- EV / TEBLIGAT → DECLARED: type zaten DECLARED, değişiklik yok (no-op). source default'ta kalır.
