# UYAP Bot v35 – Recorder v3 (stability score + auto click-test + table columns)

Yeni:
1) Selector stability score:
   - core/selector_scoring.py
   - UiMapRecording.stability_score (0..1)
   - candidates skorlama: id/name > css > text > class

2) Approve öncesi auto click-test:
   - /api/recorder/approve/ auto_test=true (default)
   - click test fail -> approve engellenir (force=true ile aşılabilir)

3) Table column recorder:
   - POST /api/recorder/suggest_table_column/ {label, table_rows_selector, col_index}
   - relative selector: css=td:nth-child(k)
   - UiMap table parsing (v21 columns_keys) için hızlandırır.

Not:
- UiMapRecording yeni alanları için migrate gerekir.

Tarih: 2026-01-05
