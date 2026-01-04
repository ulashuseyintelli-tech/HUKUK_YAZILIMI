# UYAP Bot v21 – Config Model + Column Table Parsing + Clean Degraded Mode

Yeni:
1) SystemConfig modeli:
   - degraded mode artık UiMap içine marker değil, SystemConfig key='degraded_mode' ile tutulur.
   - admin'den yönetilebilir.

2) Column-based table parsing:
   - core/table_parser.py
   - UiMap bundle'da screen.table.columns_keys tanımlanırsa read_table structured döner.

3) Selector health + auto degraded mode:
   - selector health istatistiğiyle degraded mode otomatik aç/kapat (reason yazılır)

Not:
- SystemConfig ve SelectorHealthLog için migrate gerekir.

Tarih: 2026-01-04
