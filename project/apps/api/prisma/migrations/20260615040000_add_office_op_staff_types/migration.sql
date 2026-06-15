-- PR-3a tamamlayıcı: Operasyonel görevin İLK SAHİBİ (L1) — hangi personel türleri görür/bildirim alır.
-- Yeni StaffRole enum'u YOK; mevcut StaffType kullanılır. ADDITIVE, default'lu → mevcut satırlar etkilenmez.
-- (Önceki migration 20260615030000 zaten DEV-APPLIED olduğundan ayrı dosya.)

ALTER TABLE "Office"
  ADD COLUMN "opStaffTypes" "StaffType"[] NOT NULL
  DEFAULT ARRAY['MUHASEBE', 'ADLI_KATIP', 'SEKRETER']::"StaffType"[];
