# UYAP Bot v36 – Extractor Library + UiMap Validator + Case Health

Yeni:
1) Extractor library:
   - core/extractor_library.yaml
   - Araç, haciz, e-tebligat, tahsilat için örnek extractor şablonları.

2) UiMap validator:
   - core/uimap_validator.py
   - GET /api/uimap-validate/validate_active/
   -> eksik locator binding ve columns_keys hatalarını listeler.

3) Case health report:
   - core/case_health.py
   - GET /api/case-health/<case_id>/health/
   -> score + locks + failed jobs + missing bundles + degraded mode

Tarih: 2026-01-05
