# UYAP Bot v20 – Auto Degraded Mode + Download/Upload + Selector Health

Yeni:
1) SelectorHealthLog modeli + admin
   - core/models.py: SelectorHealthLog
   - PlaywrightUiWorker her selector başarısını loglar

2) Auto degraded mode:
   - core/selector_health.py: fail rate'a göre degraded_mode otomatik aç/kapat
   - core/recipe_runner.py run başında auto_toggle_degraded_mode()

3) DSL: download_file / upload_file
   - PlaywrightUiWorker: download_file(button_key), upload_file(field_key, file_path)
   - runner action types: download_file, upload_file

Not:
- SelectorHealthLog için migrate gerekir.
- Degraded mode hala UiMapBundle içine marker yazar (MVP hack); v21'de ayrı Config modeli önerilir.

Tarih: 2026-01-04
