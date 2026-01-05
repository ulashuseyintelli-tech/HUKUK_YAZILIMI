# UYAP Bot v33 – UiMap Recorder MVP + Selector Health API

Yeni:
1) UiMapRecording modeli:
   - label/selector/meta/screenshot_path/approved

2) Recorder service (MVP):
   - core/uimap_recorder.py
   - suggest_selector_by_text(label, text) -> UiMapRecording oluşturur
   - selector önerisi: 'text=...' (MVP). Daha stabil selector için sonradan refine edilir.

3) Recorder API:
   - POST /api/recorder/suggest_by_text/ {label, text, base_url}
   - POST /api/recorder/approve/ {recording_id, section}
     -> approved eder ve ACTIVE UiMapBundle locator_bindings'e yazar

4) Selector health API:
   - GET /api/health/selector_health/ -> en çok patlayan selector'lar

Not:
- UiMapRecording için migrate gerekir.
- Recorder Playwright kullanır; kullanıcı oturumu için persistent profile (playwright_user_data) kullanır.

Tarih: 2026-01-05
